const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');
const { removeBackground, removeForeground } = require('@imgly/background-removal-node');
const winston = require('winston');
require('dotenv').config();

// 创建Winston日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      let logMessage = `[${level.toUpperCase()}][${timestamp}] ${message}`;
      if (Object.keys(meta).length > 0 && meta.stack) {
        logMessage += `\nError stack: ${meta.stack}`;
      } else if (Object.keys(meta).length > 0) {
        logMessage += `\nData: ${JSON.stringify(meta, null, 2)}`;
      }
      return logMessage;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let logMessage = `[${level}][${timestamp}] ${message}`;
          if (Object.keys(meta).length > 0 && meta.stack) {
            logMessage += `\nError stack: ${meta.stack}`;
          } else if (Object.keys(meta).length > 0) {
            // 对于非错误类型的元数据，只在debug级别显示完整信息
            if (level === 'debug') {
              logMessage += `\nData: ${JSON.stringify(meta, null, 2)}`;
            } else if (Object.keys(meta).length <= 3) {
              // 对于info级别，如果元数据字段少于等于3个，则显示简化信息
              logMessage += ` ${JSON.stringify(meta)}`;
            } else {
              // 对于info级别，如果元数据字段多于3个，则只显示字段数量
              logMessage += ` (${Object.keys(meta).length} fields)`;
            }
          }
          return logMessage;
        })
      )
    })
  ]
});

// 添加文件传输器，可选地将日志写入文件
if (process.env.LOG_FILE) {
  logger.add(new winston.transports.File({
    filename: process.env.LOG_FILE,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
}

logger.info('初始化应用...');
logger.info('加载环境变量');

const app = express();
const local_port = process.env.LOCAL_PORT || 3333;
const url = process.env.URL || 'http://localhost';

logger.info('服务器配置', { url, local_port });

// 设置EJS模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
logger.info('配置EJS模板引擎');

// 启用CORS
app.use(cors());
logger.info('启用CORS');

// 静态文件服务
app.use(express.static('public'));
logger.info('配置静态文件服务目录: public');

// 确保上传和处理的目录存在
const uploadDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'public/processed');

logger.info('配置目录路径', { uploadDir, processedDir });

const createDirOrClear = (dir) => {
  if (fs.existsSync(dir)) {
    logger.info(`目录存在: ${dir}，准备清理文件`);
    // 清空目录
    let filesCleared = 0;
    fs.readdirSync(dir).forEach(file => {
      const filePath = path.join(dir, file);
      if (fs.lstatSync(filePath).isFile()) {
        try {
          fs.unlinkSync(filePath);
          filesCleared++;
        } catch (err) {
          logger.error(`清理文件失败: ${filePath}`, { error: err });
        }
      }
    });
    logger.info(`已清理 ${filesCleared} 个文件`);
  } else {
    logger.info(`目录不存在: ${dir}，创建新目录`);
    // 创建目录
    try {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`成功创建目录: ${dir}`);
    } catch (err) {
      logger.error(`创建目录失败: ${dir}`, { error: err });
    }
  }
};

logger.debug('初始化应用目录');
createDirOrClear(uploadDir);
createDirOrClear(processedDir);
logger.debug('应用目录初始化完成');

// 配置multer存储
logger.info('配置文件上传存储');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + path.extname(file.originalname);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // 只允许上传图像文件
    // 检查文件MIME类型
    if (!file.mimetype.startsWith('image/')) {
      logger.warn(`拒绝文件: ${file.originalname} - MIME类型不匹配: ${file.mimetype}`);
      return cb(new Error('只允许上传图像文件！(MIME类型不匹配)'));
    }

    // 检查文件扩展名（不区分大小写）
    const extname = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif'].includes(extname)) {
      logger.warn(`拒绝文件: ${file.originalname} - 扩展名不支持: ${extname}`);
      return cb(new Error(`只允许上传图像文件！(扩展名 ${extname} 不被支持)`));
    }

    cb(null, true);
  }
});

app.get('/', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  logger.info(`收到首页请求: ${clientIP}`);

  // 使用EJS模板引擎渲染页面
  res.render('index', { serverURL: url });
});

// 处理图片上传和背景去除
app.post('/upload', upload.single('image'), async (req, res) => {
  const requestId = Date.now().toString();
  const timeStart = Date.now();
  logger.info(`处理图片上传请求 [ReqID:${requestId}]`);

  try {
    if (!req.file) {
      logger.warn(`未找到上传的文件 [ReqID:${requestId}]`);
      return res.status(400).json({ error: '没有上传文件' });
    }

    logger.info(`接收文件 [ReqID:${requestId}]`, {
      name: req.file.originalname,
      size: req.file.size
    });

    const inputPath = req.file.path;
    const filenameBase = path.basename(req.file.filename, path.extname(req.file.filename));
    const filename = filenameBase + '.png';
    const outputPath = path.join(processedDir, filename);

    try {
      logger.info(`开始处理图片 [ReqID:${requestId}]`);
      const fileUrl = `file://${inputPath}`;

      const options= {
        debug: true,
        model: 'small',
        output: {
          format: 'image/png',
          quality: 1.0,
          type: 'background'
        }
      };

      const result = await removeBackground(fileUrl, options);
      const arrayBuffer = await result.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

      logger.info(`图片处理完成 [ReqID:${requestId}]`, {
        size: arrayBuffer.byteLength,
        time: Date.now() - timeStart
      });
    } catch (error) {
      logger.error(`处理图片失败 [ReqID:${requestId}]`, { error });
      return res.status(500).json({ error: '背景去除失败' });
    }

    // 检查处理后的文件是否存在
    if (!fs.existsSync(outputPath)) {
      logger.error(`处理后的文件不存在 [ReqID:${requestId}]`, { outputPath });
      return res.status(500).json({ error: '获取图片失败' });
    }

    // 返回处理后的图片URL
    const response = {
      success: true,
      imageUrl: `${url}/processed/${filename}`,
      processingTime: Date.now() - timeStart
    }
    logger.info(`请求处理成功 [ReqID:${requestId}]`, { time: response.processingTime });
    res.json(response);

    // 在发送响应后删除上传的原始图片
    // fs.unlink(inputPath, (err) => {
    //   if (err) logger.error(`删除原始图片失败 [ReqID:${requestId}]`, { path: inputPath, error: err });
    // });

    // 设置一个定时器，在客户端可能已经下载后删除处理后的图片（例如5分钟后）
    setTimeout(() => {
      fs.unlink(outputPath, (err) => {
        if (err) logger.error(`定时删除处理后的图片失败 [ReqID:${requestId}]`, { path: outputPath, error: err });
      });
    }, 5 * 60 * 1000); // 5分钟

  } catch (error) {
    logger.error(`处理图片请求失败 [ReqID:${requestId}]`, { error });
    res.status(500).json({
      error: '处理图片时出错',
      details: error.message,
      requestId: requestId
    });
  }
});

// 健康检查端点
app.get('/health', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  logger.info('收到健康检查请求', { clientIP });

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    environment: {
      node: process.version,
      platform: process.platform,
      serverURL: url,
      localPort: local_port
    }
  };

  res.json(health);
});

// 处理 404 错误
app.use((req, res, next) => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: '404 Not Found' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error(`Express错误处理中间件捕获到错误`, { error: err });
  res.status(500).json({
    error: '服务器错误',
    message: err.message
  });
});

// 启动服务器
app.listen(local_port, () => {
  logger.info(`服务器启动成功！监听端口: ${local_port}`);
});

// 处理进程异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', { error });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason });
});

process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，准备关闭服务器');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，准备关闭服务器');
  process.exit(0);
});

logger.info('服务器初始化完成');