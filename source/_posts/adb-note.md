---
title: "ADB Note"
date: 2018-06-27 12:00:00
updated: 2025-11-16 12:00:00
categories: ["Android"]
tags: ["adb","工具"]
description: "记录 ADB 常用命令与调试技巧。"
toc: true
---
- 查看Activity启动耗时

  ```powershell
  C:\Users\Administrator>adb shell am start -W com.fec.axkc/com.fec.yunmall.MainActivity
  Starting: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=com.fec.axkc/com.fec.yunmall.MainActivity }
  Status: ok
  Activity: com.fec.axkc/com.fec.yunmall.MainActivity
  ThisTime: 488
  TotalTime: 488
  WaitTime: 505
  Complete
  ```



- 模拟进程强杀

  仅在当前进程处于后台时有效.

  ```powershell
  C:\Users\Administrator>adb shell am kill com.fec.axkc
  ```
