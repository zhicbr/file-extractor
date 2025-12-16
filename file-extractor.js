const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const remoteMain = require('@electron/remote/main');
const fs = require('fs');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 950,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  remoteMain.initialize();
  remoteMain.enable(mainWindow.webContents);

  mainWindow.loadFile('index.html');
  
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// 处理选择基础文件夹的请求
ipcMain.handle('select-base-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

// 处理获取文件夹内容的请求
ipcMain.handle('get-directory-contents', async (event, dirPath) => {
  try {
    const items = fs.readdirSync(dirPath);
    const result = [];
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      result.push({
        name: item,
        path: itemPath,
        isDirectory: stats.isDirectory()
      });
    }
    
    return { success: true, items: result };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 添加一个新的方法来处理保存对话框
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// 处理生成MD文件的请求
ipcMain.handle('generate-md', async (event, { basePath, selectedItems, outputFilePath }) => {
  try {
    let mdContent = ''; // 移除“文件提取报告”标题
    
    // 收集所有唯一的文件路径，排除重复
    const uniqueFilePaths = await collectUniqueFilePaths(selectedItems, basePath);
    
    // 处理所有唯一文件
    for (const filePath of uniqueFilePaths) {
      mdContent = await processItem(filePath, basePath, mdContent);
    }
    
    // 写入MD文件
    fs.writeFileSync(outputFilePath, mdContent, 'utf8');
    
    return { success: true, message: `MD文件已成功生成：${outputFilePath}` };
  } catch (error) {
    return { success: false, message: `生成失败：${error.message}` };
  }
});

// 收集所有唯一的文件路径
async function collectUniqueFilePaths(selectedItems, basePath) {
  const uniquePaths = new Set();
  
  for (const itemPath of selectedItems) {
    const stats = fs.statSync(itemPath);
    
    if (stats.isFile()) {
      uniquePaths.add(itemPath);
    } else if (stats.isDirectory()) {
      // 递归收集文件夹中的所有文件
      await collectFilesFromDirectory(itemPath, uniquePaths);
    }
  }
  
  return Array.from(uniquePaths);
}

// 递归收集文件夹中的所有文件
async function collectFilesFromDirectory(dirPath, uniquePaths) {
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      uniquePaths.add(filePath);
    } else if (stats.isDirectory()) {
      await collectFilesFromDirectory(filePath, uniquePaths);
    }
  }
}

// 处理单个项目（现在只处理文件）
async function processItem(itemPath, basePath, mdContent) {
  const stats = fs.statSync(itemPath);
  
  // 仅处理文件
  if (stats.isFile()) {
    // 获取相对路径（不包含基础目录名称）
    const relativePath = path.relative(basePath, itemPath);
    
    mdContent += `\n## ${relativePath}\n\n`;
    
    try {
      // 读取文件内容
      const fileContent = fs.readFileSync(itemPath, 'utf8');
      
      // 根据文件类型决定语言标识
      const fileExt = path.extname(itemPath).substring(1).toLowerCase();
      mdContent += '```' + fileExt + '\n' + fileContent + '\n```\n\n';
    } catch (error) {
      mdContent += `无法读取文件内容：${error.message}\n\n`;
    }
  }
  
  return mdContent;
}