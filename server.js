const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');
const { removeBackground, removeForeground } = require('@imgly/background-removal-node');
require('dotenv').config();

// 创建调试日志函数
const debug = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[INFO][${timestamp}] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN][${timestamp}] ${message}`);
    if (data) console.warn(JSON.stringify(data, null, 2));
  },
  error: (message, error) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR][${timestamp}] ${message}`);
    if (error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
    }
  },
  start: (operation) => {
    const timestamp = new Date().toISOString();
    console.log(`[START][${timestamp}] ${operation}`);
  },
  end: (operation, timeStart) => {
    const timestamp = new Date().toISOString();
    const elapsed = timeStart ? `(${Date.now() - timeStart}ms)` : '';
    console.log(`[END][${timestamp}] ${operation} ${elapsed}`);
  }
};

debug.info('初始化应用...');
debug.info('加载环境变量');

const app = express();
const port = process.env.PORT || 3333;
const server = process.env.SERVER || 'localhost';

debug.info('服务器配置', { server, port });

// 启用CORS
app.use(cors());
debug.info('启用CORS');

// 静态文件服务
app.use(express.static('public'));
debug.info('配置静态文件服务目录: public');

// 确保上传和处理的目录存在
const uploadDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'public/processed');

debug.info('配置目录路径', { uploadDir, processedDir });

const createDirOrClear = (dir) => {
  debug.start(`检查目录: ${dir}`);

  if (fs.existsSync(dir)) {
    debug.info(`目录存在: ${dir}，准备清理文件`);
    // 清空目录
    let filesCleared = 0;
    fs.readdirSync(dir).forEach(file => {
      const filePath = path.join(dir, file);
      if (fs.lstatSync(filePath).isFile()) {
        try {
          fs.unlinkSync(filePath);
          filesCleared++;
        } catch (err) {
          debug.error(`清理文件失败: ${filePath}`, err);
        }
      }
    });
    debug.info(`已清理 ${filesCleared} 个文件`);
  } else {
    debug.info(`目录不存在: ${dir}，创建新目录`);
    // 创建目录
    try {
      fs.mkdirSync(dir, { recursive: true });
      debug.info(`成功创建目录: ${dir}`);
    } catch (err) {
      debug.error(`创建目录失败: ${dir}`, err);
    }
  }

  debug.end(`目录处理完成: ${dir}`);
};

debug.start('初始化应用目录');
createDirOrClear(uploadDir);
createDirOrClear(processedDir);
debug.end('应用目录初始化完成');

// 配置multer存储
debug.info('配置文件上传存储');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    debug.info(`文件上传目标目录: ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + path.extname(file.originalname);
    debug.info(`生成上传文件名: ${filename}`);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // 只允许上传图像文件
    debug.info('验证上传文件类型', {
      filename: file.originalname,
      mimetype: file.mimetype
    });

    // 检查文件MIME类型
    if (!file.mimetype.startsWith('image/')) {
      debug.warn(`拒绝文件: ${file.originalname} - MIME类型不匹配: ${file.mimetype}`);
      return cb(new Error('只允许上传图像文件！(MIME类型不匹配)'));
    }

    // 检查文件扩展名（不区分大小写）
    const extname = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif'].includes(extname)) {
      debug.warn(`拒绝文件: ${file.originalname} - 扩展名不支持: ${extname}`);
      return cb(new Error(`只允许上传图像文件！(扩展名 ${extname} 不被支持)`));
    }

    debug.info(`文件验证通过: ${file.originalname}`);
    cb(null, true);
  }
});

app.get('/', (req, res) => {
  debug.start('处理根路径请求');
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  debug.info(`收到来自 ${clientIP} 的首页请求`);

  const filePath = path.join(__dirname, 'public', 'index.html.template');
  debug.info(`尝试读取模板文件: ${filePath}`);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      debug.error(`读取模板文件失败: ${filePath}`, err);
      return res.status(500).send('Error reading file');
    }

    debug.info(`成功读取模板文件，长度: ${data.length} 字节`);

    // 替换占位符
    const html = data
      .replace(/{{SERVER_HOST}}/g, server)
      .replace(/{{SERVER_PORT}}/g, port);

    debug.info('返回已处理的HTML页面给客户端');
    res.send(html);
    debug.end('处理根路径请求');
  });
});

// 处理图片上传和背景去除
app.post('/upload', upload.single('image'), async (req, res) => {
  const requestId = Date.now().toString();
  const timeStart = Date.now();
  debug.start(`处理图片上传请求 [ReqID:${requestId}]`);

  try {
    if (!req.file) {
      debug.warn(`未找到上传的文件 [ReqID:${requestId}]`);
      return res.status(400).json({ error: '没有上传文件' });
    }

    debug.info(`成功接收文件 [ReqID:${requestId}]`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    const inputPath = req.file.path;
    // 确保文件名正确处理
    const filenameBase = path.basename(req.file.filename, path.extname(req.file.filename));
    const filename = filenameBase + '.png';
    const outputPath = path.join(processedDir, filename);

    debug.info(`处理参数 [ReqID:${requestId}]`, {
      inputPath,
      outputPath,
      filenameBase,
      filename
    });

    let processingStartTime = Date.now();
    debug.start(`开始图片处理 [ReqID:${requestId}]`);

    try {
      // 使用URL方式作为主要方法
      debug.info(`尝试使用URL方法处理图片 [ReqID:${requestId}]`);
      const fileUrl = `file://${inputPath}`;

      debug.info(`启动removeBackground [ReqID:${requestId}]`, {
        fileUrl,
        options: {
          debug: true,
          output: {
            format: 'image/png',
            quality: 1.0,
            type: 'background'
          }
        }
      });

      const result = await removeBackground(fileUrl, {
        debug: true,
        output: {
          format: 'image/png',
          quality: 1.0,
          type: 'background'
        }
      });

      debug.info(`removeBackground处理完成 [ReqID:${requestId}]，耗时: ${Date.now() - processingStartTime}ms`);

      // 处理结果
      const arrayBuffer = await result.arrayBuffer();
      debug.info(`获取结果ArrayBuffer [ReqID:${requestId}]，大小: ${arrayBuffer.byteLength} bytes`);

      fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
      debug.info(`成功保存处理后的图片 [ReqID:${requestId}]`, { outputPath });

    } catch (error) {
      debug.error(`URL方法处理图片失败 [ReqID:${requestId}]`, error);

      // 如果URL方式失败，尝试使用base64字符串作为备选方案
      debug.info(`尝试使用base64方法作为备选 [ReqID:${requestId}]`);
      processingStartTime = Date.now();

      try {
        const imageBuffer = fs.readFileSync(inputPath);
        debug.info(`读取图片文件为Buffer [ReqID:${requestId}]，大小: ${imageBuffer.length} bytes`);

        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        debug.info(`转换为base64 [ReqID:${requestId}]，base64长度: ${base64Image.length}`);

        debug.info(`启动removeBackground（base64方法）[ReqID:${requestId}]`);
        const result = await removeBackground(base64Image, {
          debug: true,
          output: {
            format: 'image/png',
            quality: 1.0
          }
        });

        debug.info(`base64方法处理完成 [ReqID:${requestId}]，耗时: ${Date.now() - processingStartTime}ms`);

        const arrayBuffer = await result.arrayBuffer();
        fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
        debug.info(`成功保存处理后的图片（base64方法）[ReqID:${requestId}]`, { outputPath });
      } catch (secondError) {
        debug.error(`base64方法也失败 [ReqID:${requestId}]`, secondError);
        throw new Error('背景去除失败: ' + error.message);
      }
    }

    // 检查处理后的文件是否存在
    if (!fs.existsSync(outputPath)) {
      debug.error(`处理后的文件不存在 [ReqID:${requestId}]`, { outputPath });
      throw new Error('处理后的文件不存在，背景去除可能失败');
    }

    const outputFileStats = fs.statSync(outputPath);
    debug.info(`验证输出文件 [ReqID:${requestId}]`, {
      path: outputPath,
      size: outputFileStats.size,
      created: outputFileStats.birthtime
    });

    // 返回处理后的图片URL
    debug.info(`请求处理成功，返回结果 [ReqID:${requestId}]`, {
      success: true,
      imageUrl: `/processed/${filename}`,
      processingTime: Date.now() - timeStart
    });

    res.json({
      success: true,
      imageUrl: `/processed/${filename}`,
      processingTime: Date.now() - timeStart
    });

    // 在发送响应后删除上传的原始图片
    fs.unlink(inputPath, (err) => {
      if (err) debug.error(`删除原始图片失败 [ReqID:${requestId}]`, { path: inputPath, error: err });
      else debug.info(`已删除原始图片 [ReqID:${requestId}]`, { path: inputPath });
    });

    // 设置一个定时器，在客户端可能已经下载后删除处理后的图片（例如5分钟后）
    debug.info(`设置定时清理处理后的图片 [ReqID:${requestId}]`, {
      path: outputPath,
      deleteAfter: '5分钟'
    });

    setTimeout(() => {
      fs.unlink(outputPath, (err) => {
        if (err) debug.error(`定时删除处理后的图片失败 [ReqID:${requestId}]`, { path: outputPath, error: err });
        else debug.info(`已定时删除处理后的图片 [ReqID:${requestId}]`, { path: outputPath });
      });
    }, 5 * 60 * 1000); // 5分钟

    debug.end(`处理图片上传请求 [ReqID:${requestId}]`, timeStart);

  } catch (error) {
    debug.error(`处理图片请求失败 [ReqID:${requestId}]`, error);
    res.status(500).json({
      error: '处理图片时出错',
      details: error.message,
      requestId: requestId
    });
    debug.end(`处理图片上传请求(失败) [ReqID:${requestId}]`, timeStart);
  }
});

// 提供服务器配置接口
app.get('/config', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  debug.info('收到配置请求', { clientIP });
  res.json({
    server: server,
    port: port
  });
  debug.info('返回服务器配置');
});

// 健康检查端点
app.get('/health', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  debug.info('收到健康检查请求', { clientIP });

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    environment: {
      node: process.version,
      platform: process.platform,
      serverHost: server,
      serverPort: port
    }
  };

  res.json(health);
  debug.info('返回健康检查信息');
});

// 处理 404 错误
app.use((req, res, next) => {
  debug.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: '404 Not Found' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  debug.error(`Express错误处理中间件捕获到错误`, err);
  res.status(500).json({
    error: '服务器错误',
    message: err.message
  });
});

// 启动服务器
app.listen(port, () => {
  debug.info(`服务器启动成功！监听地址: http://${server}:${port}`);
});

// 处理进程异常
process.on('uncaughtException', (error) => {
  debug.error('未捕获的异常', error);
});

process.on('unhandledRejection', (reason, promise) => {
  debug.error('未处理的Promise拒绝', { reason });
});

process.on('SIGTERM', () => {
  debug.info('收到SIGTERM信号，准备关闭服务器');
  process.exit(0);
});

process.on('SIGINT', () => {
  debug.info('收到SIGINT信号，准备关闭服务器');
  process.exit(0);
});

debug.info('服务器初始化完成');