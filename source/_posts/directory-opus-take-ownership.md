---
title: "Directory Opus 添加管理员获得所有权右键菜单"
date: 2024-11-08 12:00:00
updated: 2025-11-19 12:00:00
categories: ["工具"]
tags: ["Windows","Directory Opus"]
description: "在windows的资源管理器中添加管理员获得所有权的右键菜单很容易,通过注册表就可以了."
toc: true
---
在windows的资源管理器中添加管理员获得所有权的右键菜单很容易,通过注册表就可以了.

但是在Directory Opus需要另外的操作方式,

1. 点击`设置`->`文件类型`:

    ![image-20240821113710520](image-20240821113710520.png)

2. 选择`运行DOpus函数`,因为我的资源管理器已经有这个右键了,就选这个:

    ![image-20240821114004524](image-20240821114004524.png)

3. 输入如下代码:

    ```bat
    @admin
    @echo off
    echo {f!}
    takeown /f {f!}
    icacls {f!} /grant administrators:F /t
    ```

4. 保存后,调整到适当的位置即可.

    ![image-20240821114154010](image-20240821114154010.png)
