figma.showUI(__html__, { width: 800, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'paste-to-figma') {
    try {
      const response = await fetch(msg.imageUrl);
      const imageData = await response.arrayBuffer();

      const image = figma.createImage(new Uint8Array(imageData));
      const rect = figma.createRectangle();
      rect.resize(800, 600);
      rect.fills = [{
        type: 'IMAGE',
        imageHash: image.hash,
        scaleMode: 'FIT'
      }];

      figma.viewport.scrollAndZoomIntoView([rect]);
    } catch (error) {
      figma.notify('粘贴图片到 Figma 失败', { error: true });
    }
  }
};