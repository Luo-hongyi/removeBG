# 图片背景去除工具

这是一个基于Express.js和@imgly/background-removal-node的Web应用，允许用户上传图片并自动去除背景。

## 功能特点

- 简洁易用的Web界面
- 支持上传多种格式的图片(JPG, PNG, GIF等)
- 使用@imgly/background-removal-node进行高质量的背景去除
- 支持处理后图片的预览和下载

## 安装

1. 确保已安装Node.js (推荐v14.0.0或更高版本)

2. 克隆此仓库或下载代码

3. 安装依赖:
```bash
npm install
```

## 使用方法

1. 启动服务器:
```bash
npm start
```

2. 打开浏览器访问:
```
http://localhost:3333
```

3. 使用界面上传图片，系统会自动处理并显示结果

## 技术栈

- 前端: HTML, CSS, JavaScript
- 后端: Node.js, Express.js
- 图像处理: @imgly/background-removal-node
- 文件上传: multer

## 项目结构

```
.
├── server.js         # Express服务器入口文件
├── package.json      # 项目配置和依赖
├── public/           # 静态资源目录
│   ├── index.html    # 前端页面
│   └── processed/    # 处理后的图片存储目录
└── uploads/          # 上传图片的临时存储目录
```

## 注意事项

- 背景去除处理可能需要一定时间，特别是对于大尺寸图片
- 此应用仅在本地运行，如需部署到生产环境，请考虑添加适当的安全措施

## 许可

ISC