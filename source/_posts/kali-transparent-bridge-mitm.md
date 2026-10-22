---
title: "Kali 二层透明桥 HTTP MITM 实验复现记录"
date: 2026-10-22 12:00:00
updated: 2026-10-22 12:00:00
categories: ["网络安全"]
tags: ["Kali","MITM","透明桥"]
description: "在 Kali 上搭建二层透明桥，配合 DNAT 与 Python 实现 HTTP MITM 的实验复现记录。"
toc: true
---
## 1. 最终已经验证成功的方案

当前实验最终采用：

```text
L2 Bridge
    +
bridge prerouting 修改 Ethernet 目的 MAC
    +
IPv4 DNAT
    +
Python 普通 TCP Server
    +
SO_ORIGINAL_DST
```

**没有采用 TPROXY。**

完整路径：

```text
Client 192.168.0.227
        |
        | TCP/80
        v
      eth0
        |
        v
      br0
        |
        | bridge prerouting
        | dst MAC: Server MAC
        |        ↓
        |        br0 MAC
        v
   IPv4 PREROUTING
        |
        | DNAT
        | 192.168.0.100:80
        |      ↓
        | 192.168.0.141:18080
        v
 Python MITM
        |
        | SO_ORIGINAL_DST
        | = 192.168.0.100:80
        v
 Real Server
        |
        | ORIGINAL RESPONSE
        v
 Python
        |
        | 修改 / 延迟
        v
 Client
```

最终已经真实验证：

```text
Client GET /
        ↓
Python MITM 收到
        ↓
获取 original dst = 192.168.0.100:80
        ↓
访问真实服务器
        ↓
拿到 ORIGINAL RESPONSE
        ↓
修改为 MITM MODIFIED
        ↓
Client HTTP 200
```

---

# 2. 测试环境

```text
OS:
Kali GNU/Linux Rolling
VERSION_ID=2026.3

Kernel:
6.18.12+kali-amd64
Kali 6.18.12-1kali1

Architecture:
x86_64

nftables:
v1.1.6

iproute2:
7.1.0

Python:
3.13.14
```

查询：

```bash
uname -a
cat /etc/os-release
nft --version
ip -V
python3 --version
```

---

# 3. 网络拓扑

## 3.1 接口

```text
eth0
MAC 40:62:31:15:01:d6
Client 侧

eth1
MAC 40:62:31:15:01:d7
Server 侧

eth2
MAC 00:0e:c6:2d:63:04
192.168.0.141/24
Kali 本机地址

br0
MAC 40:62:31:15:01:d6
无 IPv4 地址
纯二层 Bridge
```

实际：

```text
              Kali
        ┌──────────────────┐
        │                  │
Client──eth0             eth1──Server
        │                  │
        └─────── br0 ──────┘
```

测试地址：

```text
CLIENT_IP = 192.168.0.227
SERVER_IP = 192.168.0.100
KALI_IP   = 192.168.0.141

CLIENT_IF = eth0
SERVER_IF = eth1
BRIDGE    = br0

HTTP_PORT  = 80
PROXY_PORT = 18080
```

---

# 4. 创建 br0

当前结构：

```text
eth0 ─┐
      ├── br0
eth1 ─┘
```

创建：

```bash
sudo ip link add br0 type bridge

sudo ip link set eth0 master br0
sudo ip link set eth1 master br0

sudo ip link set eth0 up
sudo ip link set eth1 up
sudo ip link set br0 up
```

验证：

```bash
bridge link
```

应看到：

```text
eth0 master br0 state forwarding
eth1 master br0 state forwarding
```

---

# 5. Bridge VLAN

当前默认 VLAN 1：

```bash
bridge vlan show
```

结果：

```text
eth0    1 PVID Egress Untagged
eth1    1 PVID Egress Untagged
br0     1 PVID Egress Untagged
```

---

# 6. Bridge FDB

关键 MAC：

```text
Client:
192.168.0.227
MAC 6c:4b:90:87:40:43
→ eth0

Server:
192.168.0.100
MAC 02:16:3e:29:9c:09
→ eth1

br0:
40:62:31:15:01:d6
```

验证：

```bash
bridge fdb show br br0
```

关键：

```text
6c:4b:90:87:40:43 dev eth0 master br0
02:16:3e:29:9c:09 dev eth1 master br0
```

---

# 7. 为什么 br0 不需要 IP

`br0` 是透明二层桥：

```text
eth0 <-> br0 <-> eth1
```

正常 bridge 转发本身不需要 IPv4。

我们实际利用的是：

```text
bridge prerouting
        ↓
把目标 MAC 改为 br0 MAC
        ↓
Linux 把该帧当成送给本机
        ↓
进入 IPv4 PREROUTING
```

所以最终方案不要求给 `br0` 配一个业务 IP。

---

# 8. eth2 同网段问题

当前：

```text
eth2 = 192.168.0.141/24
```

而业务：

```text
192.168.0.227
192.168.0.100
```

也在：

```text
192.168.0.0/24
```

这会造成一定的路由/ARP 歧义。

实验中用显式 host route 解决：

```bash
sudo ip route replace 192.168.0.100/32 dev br0
sudo ip route replace 192.168.0.227/32 dev br0
```

最终：

```bash
ip route get 192.168.0.100
```

得到：

```text
192.168.0.100 dev br0 src 192.168.0.141
```

以及：

```bash
ip route get 192.168.0.227
```

得到：

```text
192.168.0.227 dev br0 src 192.168.0.141
```

**以后生产最好让管理网卡和业务桥处于不同网段。**

---

# 9. Bridge netfilter

加载：

```bash
sudo modprobe br_netfilter
```

确认：

```bash
lsmod | grep br_netfilter
```

当前：

```text
br_netfilter
```

sysctl：

```bash
sudo sysctl -w net.bridge.bridge-nf-call-iptables=1
sudo sysctl -w net.bridge.bridge-nf-call-ip6tables=1
sudo sysctl -w net.bridge.bridge-nf-call-arptables=1
```

确认：

```bash
sysctl net.bridge.bridge-nf-call-iptables
sysctl net.bridge.bridge-nf-call-ip6tables
sysctl net.bridge.bridge-nf-call-arptables
```

---

# 10. 当前 IPv4 sysctl

当前实验值：

```text
net.ipv4.ip_forward = 1

net.ipv4.conf.all.rp_filter = 0
net.ipv4.conf.eth0.rp_filter = 0
net.ipv4.conf.eth1.rp_filter = 2
net.ipv4.conf.br0.rp_filter = 0

net.ipv4.conf.all.src_valid_mark = 1

net.ipv4.conf.all.accept_local = 1

net.ipv4.ip_nonlocal_bind = 0
```

其中：

```text
ip_nonlocal_bind
```

是 TPROXY 实验留下的，**最终 DNAT 方案不依赖它**。

---

# 11. 最关键的 Bridge nft 规则

原始以太帧：

```text
src MAC = Client MAC
dst MAC = Server MAC
```

即：

```text
Client MAC → Server MAC
```

这时 Linux bridge 会：

```text
eth0 → br0 → eth1
```

直接转发。

所以需要改成：

```text
src MAC = Client MAC
dst MAC = br0 MAC
```

这样 Linux 才会把它交给本机 IP stack。

最终成功规则：

```nft
iifname "eth0"
ether type ip
ip saddr 192.168.0.227
ip daddr 192.168.0.100
tcp dport 80
meta pkttype set host
ether daddr set 40:62:31:15:01:d6
counter
```

完整：

```bash
sudo nft add table bridge test_bridge 2>/dev/null || true

sudo nft add chain bridge test_bridge prerouting \
'{ type filter hook prerouting priority -300; policy accept; }' \
2>/dev/null || true

sudo nft flush chain bridge test_bridge prerouting

sudo nft add rule bridge test_bridge prerouting \
    iifname "eth0" \
    ether type ip \
    ip saddr 192.168.0.227 \
    ip daddr 192.168.0.100 \
    tcp dport 80 \
    meta pkttype set host \
    ether daddr set 40:62:31:15:01:d6 \
    counter
```

最终输出：

```text
table bridge test_bridge {
    chain prerouting {
        type filter hook prerouting priority dstnat;
        policy accept;

        iifname "eth0"
        ip saddr 192.168.0.227
        ip daddr 192.168.0.100
        tcp dport 80
        meta pkttype set host
        ether daddr set 40:62:31:15:01:d6
        counter
    }
}
```

---

# 12. 最关键的 IPv4 DNAT

创建：

```bash
sudo nft add table ip mitm_nat 2>/dev/null || true

sudo nft add chain ip mitm_nat prerouting \
'{ type nat hook prerouting priority -100; policy accept; }' \
2>/dev/null || true
```

规则：

```bash
sudo nft flush chain ip mitm_nat prerouting

sudo nft add rule ip mitm_nat prerouting \
    ip saddr 192.168.0.227 \
    ip daddr 192.168.0.100 \
    tcp dport 80 \
    counter \
    dnat to 192.168.0.141:18080
```

最终：

```text
192.168.0.227:随机端口
        ↓
192.168.0.100:80
        ↓
DNAT
        ↓
192.168.0.141:18080
```

注意：

`dnat` 是 terminal NAT statement。

所以：

```text
正确：
counter
dnat to ...

错误：
dnat to ...
counter
```

后者会出现：

```text
Statement after terminal statement has no effect
```

---

# 13. 当前完整 nft

最终核心只有两个表：

```text
table bridge test_bridge
table ip mitm_nat
```

Bridge：

```text
Client IP
    ↓
bridge prerouting
    ↓
dst MAC → br0 MAC
```

NAT：

```text
192.168.0.100:80
    ↓
192.168.0.141:18080
```

查看：

```bash
sudo nft list table bridge test_bridge
sudo nft list table ip mitm_nat
```

完整：

```bash
sudo nft list ruleset
```

---

# 14. Python 最小 MITM

当前成功验证的逻辑：

```python
import socket

LISTEN_IP = "192.168.0.141"
LISTEN_PORT = 18080

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

s.setsockopt(
    socket.SOL_SOCKET,
    socket.SO_REUSEADDR,
    1
)

s.bind((LISTEN_IP, LISTEN_PORT))
s.listen(128)

print(
    f"LISTEN {LISTEN_IP}:{LISTEN_PORT}",
    flush=True
)

while True:
    c, addr = s.accept()

    print("ACCEPT:", addr, flush=True)

    data = c.recv(4096)

    print(
        data.decode(
            "utf-8",
            errors="replace"
        ),
        flush=True
    )

    c.sendall(
        b"HTTP/1.1 200 OK\r\n"
        b"Content-Type: text/plain\r\n"
        b"Content-Length: 16\r\n"
        b"Connection: close\r\n"
        b"\r\n"
        b"MITM SUCCESS!\n"
    )

    c.close()
```

启动：

```bash
sudo python minmit.py
```

监听：

```text
LISTEN 192.168.0.141:18080
```

---

# 15. SO_ORIGINAL_DST

DNAT 后：

```text
Python
    ↓
192.168.0.141:18080
```

为了知道真正目的地址：

```text
192.168.0.100:80
```

使用：

```python
SO_ORIGINAL_DST = 80

data = conn.getsockopt(
    socket.SOL_IP,
    SO_ORIGINAL_DST,
    16
)
```

解析：

```python
import struct
import socket

family, port, raw_ip = struct.unpack(
    "!HH4s8x",
    data
)

original_ip = socket.inet_ntoa(raw_ip)
```

实验实际输出：

```text
original dst: ('192.168.0.100', 80)
```

这正好和 `mtls` 项目的 `ssl_server.py` 中现有逻辑吻合。

---

# 16. 已验证的真实请求

Python 收到：

```http
GET / HTTP/1.1
Accept-Encoding: identity
Host: 192.168.0.100
User-Agent: Python-urllib/3.14
Connection: close
```

Python 解析：

```text
original dst: ('192.168.0.100', 80)
```

连接真实服务器后收到：

```http
HTTP/1.0 200 OK
Server: BaseHTTP/0.6 Python/3.11.9
Content-Type: text/plain; charset=utf-8
Content-Length: 83
Connection: close
```

Body：

```text
ORIGINAL RESPONSE
time: ...
message: hello from real server
```

然后 Python 修改为：

```text
MITM MODIFIED
```

Client 最终：

```text
HTTP 200
Response:
MITM MODIFIED
```

**这个结果已经真实成功。**

---

# 17. Response 延迟

这是最开始的核心需求之一。

当前处理流程：

```text
真实 Server Response
        ↓
Python 接收
        ↓
你的业务逻辑
        ↓
等待
        ↓
修改
        ↓
client.sendall()
```

例如：

```python
response = recv_all(upstream)

# 等业务逻辑准备完
time.sleep(1)

response = modify_response(response)

client.sendall(response)
```

所以：

> 原始 HTTP Response 到达 Kali 后，可以先缓存，不立即返回客户端；等自己的逻辑完成后再发送。

当前测试已经验证这种模式可行。

---

# 18. TCP 抓包验证

## 原始客户端方向

```bash
sudo tcpdump -eni eth0 -nn \
'host 192.168.0.227 and host 192.168.0.100 and tcp port 80'
```

可以看到：

```text
SYN
SYN,ACK
ACK
GET
HTTP response
FIN
```

例如：

```text
192.168.0.227.42312 > 192.168.0.100.80 SYN
192.168.0.100.80 > 192.168.0.227.42312 SYN,ACK
192.168.0.227.42312 > 192.168.0.100.80 ACK
192.168.0.227.42312 > 192.168.0.100.80 GET
```

---

## DNAT 后

```bash
sudo tcpdump -ni any -nn \
'host 192.168.0.227 and host 192.168.0.141 and tcp port 18080'
```

可以看到：

```text
192.168.0.227.xxxxx > 192.168.0.141.18080 SYN
192.168.0.227.xxxxx > 192.168.0.141.18080 ACK
192.168.0.227.xxxxx > 192.168.0.141.18080 GET
```

这已经实际观察过。

---

# 19. 成功判定

同时满足以下条件：

### Bridge rule counter

```bash
sudo nft list chain bridge test_bridge prerouting
```

counter 增长。

### DNAT counter

```bash
sudo nft list chain ip mitm_nat prerouting
```

counter 增长。

### Python

出现：

```text
ACCEPT: ('192.168.0.227', xxxx)
```

### Original destination

出现：

```text
original dst: ('192.168.0.100', 80)
```

### Original Response

看到：

```text
ORIGINAL RESPONSE
```

### Client

看到：

```text
MITM MODIFIED
```

满足这些就意味着整个透明 MITM 已经成功。

---

# 20. 为什么没有继续使用 TPROXY

实验过程中曾尝试：

```text
bridge
  ↓
broute
  ↓
TPROXY
  ↓
IP_TRANSPARENT
  ↓
fwmark
  ↓
policy routing
```

曾成功看到：

```text
bridge prerouting
      ↓
ip tproxy prerouting
      ↓
INPUT
```

但 TCP 接管没有稳定完成。

最终 DNAT 方案反而完整打通：

```text
bridge
 ↓
MAC rewrite
 ↓
IPv4 PREROUTING
 ↓
DNAT
 ↓
普通 TCP socket
 ↓
Python
```

并且项目已有：

```python
SO_ORIGINAL_DST
```

因此 DNAT 更符合这个项目当前的代码结构。

---

# 21. TPROXY 遗留配置清理

已经清除：

```bash
sudo nft flush chain ip tproxy_test prerouting
```

policy routing：

```bash
sudo ip rule del fwmark 0x1 lookup 100 2>/dev/null || true
sudo ip route flush table 100
```

当前：

```bash
ip rule
```

应该恢复：

```text
0:      from all lookup local
32766:  from all lookup main
32767:  from all lookup default
```

`table 100` 应为空。

---

# 22. 调试经验总结

## 只看到 br0 流量

```text
tcpdump br0 有包
```

不代表 Python 会收到。

因为：

```text
br0 是 L2 bridge
```

默认只是：

```text
eth0 → br0 → eth1
```

不会进入本机 TCP socket。

---

## `meta broute set 1` 方案没有采用

因为虽然可以把 bridge 流量送往 IP 路径，但这次实验组合下 TPROXY 没有最终稳定接管。

最终使用：

```text
meta pkttype set host
ether daddr set <br0-mac>
```

来明确把目标帧变成本机帧。

---

## 最重要的诊断方法

### Bridge 层：

```bash
sudo nft list chain bridge test_bridge prerouting
```

### NAT：

```bash
sudo nft list chain ip mitm_nat prerouting
```

### Python：

```bash
ss -lnpt | grep 18080
```

### 抓包：

```bash
tcpdump -eni eth0 ...
tcpdump -ni any ...
```

### 内核路径：

```bash
sudo nft monitor trace
```

---

# 23. 恢复纯二层 Bridge

停止 MITM：

```bash
sudo nft flush chain ip mitm_nat prerouting
sudo nft flush chain bridge test_bridge prerouting
```

或者完全删除：

```bash
sudo nft delete table ip mitm_nat
sudo nft delete table bridge test_bridge
```

停止 Python：

```bash
sudo pkill -f minmit.py
```

host route 可以恢复：

```bash
sudo ip route del 192.168.0.100/32 dev br0
sudo ip route del 192.168.0.227/32 dev br0
```

恢复后：

```text
eth0
 ↓
br0
 ↓
eth1
```

重新变成普通透明 Bridge。

---

# 24. 当前最终推荐架构

```text
                  Kali
        ┌─────────────────────────┐
        │                         │
Client  │ eth0                eth1│  Server
 .227 ──┤  │                   │  ├── .100
        │  └────── br0 ───────┘  │
        │          │              │
        │          │              │
        │ bridge prerouting       │
        │          │              │
        │   MAC → br0 MAC         │
        │          │              │
        │          ▼              │
        │   IPv4 PREROUTING       │
        │          │              │
        │       DNAT :80          │
        │          │              │
        │          ▼              │
        │  192.168.0.141:18080    │
        │          │              │
        │          ▼              │
        │       Python            │
        │          │              │
        │       SO_ORIGINAL_DST   │
        │          │              │
        └──────────┼───────────────┘
                   │
                   ▼
             Real Server
```

---

# 25. 生产环境迁移注意事项

测试环境：

```text
CLIENT_IP=192.168.0.227
SERVER_IP=192.168.0.100
KALI_IP=192.168.0.141
```

生产环境需要替换成实际值：

```text
CLIENT_IP=10.200.153.129
SERVER_IP=10.4.201.115
KALI_IP=<Kali在该业务网络可用的本地地址>
```

同时确认：

```text
eth0 = client side
eth1 = server side
eth2 = management
br0 = transparent bridge
```

生产最重要的是：

**Kali 必须物理/二层处在 Client 和 Server 的实际通信路径上。**

本方案不是普通的旁路抓包。

---

# 26. 当前状态的一句话备忘

以后看到这句话就知道做到哪一步：

> **已经成功实现 Kali 纯二层 br0 透明桥，通过 bridge prerouting 把目标 IP 流量的 Ethernet 目的 MAC 改为 br0 MAC，再用 DNAT 将 `192.168.0.100:80` 转到 Kali 本地 `192.168.0.141:18080`，Python 可以通过 `SO_ORIGINAL_DST` 获取原始目标、连接真实服务器、读取并修改 HTTP Response，然后返回给原客户端。**

---

这份就可以作为**当前实验基线**。后面真正接 `mtls` 时，核心上只需要把现在已经验证成功的 `minmit.py` 的“普通 TCP 接收 + upstream + Response 处理”替换成项目自身的 HTTP/插件逻辑，前面的 **br0 + MAC rewrite + DNAT** 部分不用再重新研究。
