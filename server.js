const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sharp = require('sharp');
const { removeBackground, removeForeground } = require('@imgly/background-removal-node');

const app = express();
const port = 3333;

// 启用CORS
app.use(cors());

// 静态文件服务
app.use(express.static('public'));

// 确保上传和处理的目录存在
const uploadDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'public/processed');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(processedDir)) {
  fs.mkdirSync(processedDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // 只允许上传图像文件
    console.log('上传文件信息：', file.originalname, file.mimetype);

    // 检查文件MIME类型
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('只允许上传图像文件！(MIME类型不匹配)'));
    }

    // 检查文件扩展名（不区分大小写）
    const extname = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.gif'].includes(extname)) {
      return cb(new Error(`只允许上传图像文件！(扩展名 ${extname} 不被支持)`));
    }

    cb(null, true);
  }
});

// 处理图片上传和背景去除
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    console.log('成功上传文件：', req.file.path);

    const inputPath = req.file.path;
    // 确保文件名正确处理
    const filenameBase = path.basename(req.file.filename, path.extname(req.file.filename));
    const filename = filenameBase + '.png';
    const outputPath = path.join(processedDir, filename);

    console.log('开始处理图片...');
    console.log('输入路径:', inputPath);
    console.log('输出路径:', outputPath);

    console.log('去除背景...');
    try {
      // 使用URL方式作为主要方法
      const fileUrl = `file://${inputPath}`;
      const result = await removeBackground(fileUrl, {
        debug: true,
        output: {
          format: 'image/png',
          quality: 1.0,
          type: 'background'
        }
      });

      // 处理结果
      const arrayBuffer = await result.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
      console.log('背景去除成功');

    } catch (error) {
      console.error('背景去除错误:', error);

      // 如果URL方式失败，尝试使用base64字符串作为备选方案
      console.log('尝试使用base64格式作为备选...');
      try {
        const imageBuffer = fs.readFileSync(inputPath);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        const result = await removeBackground(base64Image, {
          debug: true,
          output: {
            format: 'image/png',
            quality: 1.0
          }
        });

        const arrayBuffer = await result.arrayBuffer();
        fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
        console.log('使用base64方法背景去除成功');
      } catch (secondError) {
        console.error('base64方法错误:', secondError);
        throw new Error('背景去除失败: ' + error.message);
      }
    }

    // 检查处理后的文件是否存在
    if (!fs.existsSync(outputPath)) {
      throw new Error('处理后的文件不存在，背景去除可能失败');
    }

    // 返回处理后的图片URL
    res.json({
      success: true,
      imageUrl: `/processed/${filename}`
    });
    console.log('请求处理完成');
  } catch (error) {
    console.error('背景去除过程中出错：', error);
    res.status(500).json({ error: '处理图片时出错', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});