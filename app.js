// 浏览器端路径处理模拟
const path = {
  join: (...args) => {
    return args
      .map((part, i) => {
        if (!part) return '';
        if (i === 0) return part.trim().replace(/\/+$/g, '');
        return part.trim().replace(/(^\/+|\/+$)/g, '');
      })
      .filter(x => x.length)
      .join('/');
  },
  relative: (from, to) => {
    // 简单实现：假设 to 总是包含 from
    if (to.startsWith(from)) {
      let rel = to.slice(from.length);
      if (rel.startsWith('/')) rel = rel.slice(1);
      return rel;
    }
    return to;
  },
  basename: (p) => p.split('/').pop(),
  extname: (p) => {
    const parts = p.split('.');
    return parts.length > 1 ? '.' + parts.pop() : '';
  },
  sep: '/'
};

// 全局状态
let directoryHandle = null; // 根目录句柄
let currentHandle = null;   // 当前浏览的目录句柄
let basePath = '';          // 根目录名称 (显示用)
let currentPath = '';       // 当前路径 (相对于根)
const selectedItems = new Set(); // 存储被选中的路径 (相对路径)
let pathHistory = [];       // 历史记录 (存储相对路径字符串)

// 元素引用
const selectBaseDirBtn = document.getElementById('selectBaseDirBtn');
const clearSelectionsBtn = document.getElementById('clearSelectionsBtn');
const generateMdBtn = document.getElementById('generateMdBtn');
const generateStructBtn = document.getElementById('generateStructBtn');
const baseDirDisplay = document.getElementById('baseDirDisplay');
const basePathText = document.getElementById('basePathText');
const fileList = document.getElementById('fileList');
const selectedItemsList = document.getElementById('selectedItemsList');
const statusMessage = document.getElementById('statusMessage');
const breadcrumbPath = document.getElementById('breadcrumbPath');
const backBtn = document.getElementById('backBtn');

// 初始化
function init() {
  updateGenerateButtonState();
  updateBackBtnState();
}

// 选择基础文件夹
selectBaseDirBtn.addEventListener('click', async () => {
  try {
    // 使用 File System Access API
    directoryHandle = await window.showDirectoryPicker();
    basePath = directoryHandle.name;
    currentPath = basePath;
    currentHandle = directoryHandle;
    
    // 重置状态
    pathHistory = [{ path: basePath, handle: directoryHandle }];
    selectedItems.clear();
    
    updateSelectedItemsList();
    updateGenerateButtonState();
    
    basePathText.textContent = basePath;
    baseDirDisplay.classList.remove('hidden');
    
    await loadDirectoryContents(currentHandle);
    updateBreadcrumb();
  } catch (error) {
    if (error.name !== 'AbortError') {
      showStatus(false, `选择文件夹失败: ${error.message}`);
    }
  }
});

// 清除所有选择
clearSelectionsBtn.addEventListener('click', () => {
  if (selectedItems.size > 0) {
    selectedItems.clear();
    updateSelectedItemsList();
    updateGenerateButtonState();
    
    // 更新视图
    const currentFileItems = fileList.querySelectorAll('.file-item');
    currentFileItems.forEach(fileItem => fileItem.classList.remove('selected'));
    
    showStatus(true, '已清除所有选择');
  }
});

// 生成 MD 文件
generateMdBtn.addEventListener('click', async () => {
  try {
    if (selectedItems.size === 0) {
      showStatus(false, '请至少选择一个文件或文件夹');
      return;
    }

    // 1. 生成内容
    let mdContent = '';
    const uniqueFiles = await collectUniqueFiles(directoryHandle);
    
    for (const file of uniqueFiles) {
      mdContent = await processFile(file, mdContent);
    }

    // 2. 保存文件
    try {
      const saveHandle = await window.showSaveFilePicker({
        suggestedName: 'extracted-files.md',
        startIn: directoryHandle,
        types: [{
          description: 'Markdown File',
          accept: { 'text/markdown': ['.md'] },
        }],
      });
      
      const writable = await saveHandle.createWritable();
      await writable.write(mdContent);
      await writable.close();
      
      showStatus(true, 'MD文件已成功生成！');
    } catch (err) {
      if (err.name !== 'AbortError') {
        throw err;
      }
    }
    
  } catch (error) {
    showStatus(false, `生成失败: ${error.message}`);
    console.error(error);
  }
});

// 生成项目结构
generateStructBtn.addEventListener('click', async () => {
  try {
    if (selectedItems.size === 0) return;

    // 1. 收集路径
    const paths = await collectStructurePaths(directoryHandle);
    
    // 2. 生成树形文本
    const treeText = generateAsciiTree(paths);
    const mdContent = '# Project Structure\n\n```text\n' + treeText + '\n```\n';

    // 3. 保存
    try {
      const saveHandle = await window.showSaveFilePicker({
        suggestedName: 'project-structure.md',
        startIn: directoryHandle,
        types: [{
          description: 'Markdown File',
          accept: { 'text/markdown': ['.md'] },
        }],
      });
      
      const writable = await saveHandle.createWritable();
      await writable.write(mdContent);
      await writable.close();
      
      showStatus(true, '项目结构文件已成功生成！');
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }

  } catch (error) {
    showStatus(false, `生成结构失败: ${error.message}`);
    console.error(error);
  }
});

async function collectStructurePaths(rootDirHandle) {
  const paths = new Set();
  
  for (const itemPath of selectedItems) {
    const relPath = path.relative(basePath, itemPath);
    
    if (relPath === '') {
       // Root selected
       await collectAllPathsRecursively(rootDirHandle, '', paths);
    } else {
       // Find handle
      const parts = relPath.split('/');
      let current = rootDirHandle;
      let targetName = parts.pop();
      
      // Traverse to the parent directory of the target
      for (const part of parts) {
        current = await current.getDirectoryHandle(part);
      }
      
      try {
        // Try as file first
        await current.getFileHandle(targetName);
        paths.add(relPath);
      } catch {
        // Must be directory
        const dirHandle = await current.getDirectoryHandle(targetName);
        // Add the directory itself
        paths.add(relPath);
        // Add children
        await collectAllPathsRecursively(dirHandle, relPath, paths);
      }
    }
  }
  return Array.from(paths);
}

async function collectAllPathsRecursively(dirHandle, currentRelPath, paths) {
  for await (const entry of dirHandle.values()) {
    const entryPath = currentRelPath ? path.join(currentRelPath, entry.name) : entry.name;
    paths.add(entryPath);
    
    if (entry.kind === 'directory') {
      await collectAllPathsRecursively(entry, entryPath, paths);
    }
  }
}

function generateAsciiTree(paths) {
  const root = {};
  for (const p of paths) {
    const parts = p.split('/');
    let current = root;
    for (const part of parts) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
  }
  
  return (basePath || 'root') + '/\n' + printTree(root, '');
}

function printTree(node, prefix) {
  let str = '';
  const keys = Object.keys(node).sort((a, b) => a.localeCompare(b));
  
  keys.forEach((key, index) => {
    const isLast = index === keys.length - 1;
    str += prefix + (isLast ? '└── ' : '├── ') + key + '\n';
    
    if (Object.keys(node[key]).length > 0) {
      str += printTree(node[key], prefix + (isLast ? '    ' : '│   '));
    }
  });
  return str;
}

// 收集所有需要处理的文件 (处理递归和去重)
async function collectUniqueFiles(rootDirHandle) {
  const filesToProcess = [];
  
  // 辅助函数：根据路径获取 Handle
  // 这里的 pathStr 是相对于 basePath 的路径，例如 "src/index.js"
  // 注意：selectedItems 存储的是完整显示路径，如 "project/src/index.js"
  
  for (const itemPath of selectedItems) {
    // 移除 basePath 前缀以获得相对路径
    const relPath = path.relative(basePath, itemPath);
    
    if (relPath === '') {
      // 选择了整个根目录
      await collectAllFilesRecursively(rootDirHandle, basePath, filesToProcess);
    } else {
      // 解析路径找到对应的 Handle
      const parts = relPath.split('/');
      let current = rootDirHandle;
      let targetName = parts.pop();
      
      // 遍历到目标文件夹
      for (const part of parts) {
        current = await current.getDirectoryHandle(part);
      }
      
      try {
        // 尝试作为文件获取
        const fileHandle = await current.getFileHandle(targetName);
        filesToProcess.push({ 
          handle: fileHandle, 
          displayPath: itemPath 
        });
      } catch {
        // 尝试作为目录获取
        const dirHandle = await current.getDirectoryHandle(targetName);
        await collectAllFilesRecursively(dirHandle, itemPath, filesToProcess);
      }
    }
  }
  
  // 简单去重 (基于 displayPath)
  const unique = new Map();
  filesToProcess.forEach(item => unique.set(item.displayPath, item));
  return Array.from(unique.values());
}

async function collectAllFilesRecursively(dirHandle, currentDisplayPath, results) {
  for await (const entry of dirHandle.values()) {
    const entryDisplayPath = path.join(currentDisplayPath, entry.name);
    
    if (entry.kind === 'file') {
      results.push({
        handle: entry,
        displayPath: entryDisplayPath
      });
    } else if (entry.kind === 'directory') {
      await collectAllFilesRecursively(entry, entryDisplayPath, results);
    }
  }
}

async function processFile(fileItem, currentContent) {
  try {
    const file = await fileItem.handle.getFile();
    const text = await file.text();
    
    // 获取相对路径（不包含基础目录名称，与原版保持一致）
    const relativePath = path.relative(basePath, fileItem.displayPath);
    
    currentContent += `
## ${relativePath}\n\n`;
    const fileExt = path.extname(fileItem.displayPath).substring(1).toLowerCase() || 'txt';
    currentContent += '```' + fileExt + '\n' + text + '\n```\n\n';
    
  } catch (err) {
    currentContent += `
## ${path.relative(basePath, fileItem.displayPath)}\n\n(无法读取文件内容: ${err.message})

`;
  }
  return currentContent;
}

// 返回上一级
backBtn.addEventListener('click', async () => {
  if (pathHistory.length > 1) {
    pathHistory.pop(); // 移除当前
    const prev = pathHistory[pathHistory.length - 1];
    currentPath = prev.path;
    currentHandle = prev.handle;
    
    await loadDirectoryContents(currentHandle);
    updateBreadcrumb();
    updateBackBtnState();
  }
});

// 加载目录内容
async function loadDirectoryContents(dirHandle) {
  try {
    fileList.innerHTML = '';
    const items = [];
    
    for await (const entry of dirHandle.values()) {
      items.push({
        name: entry.name,
        kind: entry.kind,
        handle: entry,
        // 构建完整显示路径用于唯一标识
        path: path.join(currentPath, entry.name) 
      });
    }
    
    // 排序：文件夹在前，文件在后
    items.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name);
      return a.kind === 'directory' ? -1 : 1;
    });

    if (items.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = '(空文件夹)';
      fileList.appendChild(emptyItem);
    }

    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'file-item';
      if (selectedItems.has(item.path)) {
        li.classList.add('selected');
      }

      const icon = document.createElement('span');
      icon.className = item.kind === 'directory' ? 'file-item-icon folder-icon' : 'file-item-icon file-icon';
      
      const name = document.createElement('span');
      name.textContent = item.name;
      
      li.appendChild(icon);
      li.appendChild(name);

      // 点击事件
      li.addEventListener('click', async () => {
        if (item.kind === 'directory') {
          // 进入文件夹
          currentPath = item.path;
          currentHandle = item.handle;
          pathHistory.push({ path: currentPath, handle: currentHandle });
          await loadDirectoryContents(currentHandle);
          updateBreadcrumb();
          updateBackBtnState();
        } else {
          // 选中文件
          toggleSelection(item.path);
          li.classList.toggle('selected');
        }
      });

      // 右键菜单
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        createContextMenu(e, item, li);
      });

      fileList.appendChild(li);
    });

  } catch (error) {
    showStatus(false, `加载目录失败: ${error.message}`);
  }
}

function createContextMenu(e, item, liElement) {
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.position = 'absolute';
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
  menu.style.zIndex = 1000;
  
  const addItem = (text, onClick) => {
    const div = document.createElement('div');
    div.className = 'context-menu-item';
    div.textContent = text;
    div.onclick = () => {
      onClick();
      document.body.removeChild(menu);
    };
    menu.appendChild(div);
  };

  addItem('选择/取消选择', () => {
    toggleSelection(item.path);
    liElement.classList.toggle('selected');
  });

  if (item.kind === 'directory') {
    addItem('选择整个文件夹', async () => {
      // 对于 Web 版，我们只是标记这个文件夹路径被选中
      // 实际生成时会递归读取
      if (!selectedItems.has(item.path)) {
        selectedItems.add(item.path);
        updateSelectedItemsList();
        updateGenerateButtonState();
        
        // 可视化反馈：如果是当前列表项，标记为选中
        liElement.classList.add('selected');
      }
    });
  }

  document.body.appendChild(menu);
  
  const closeMenu = () => {
    if (document.body.contains(menu)) document.body.removeChild(menu);
    document.removeEventListener('click', closeMenu);
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function updateBreadcrumb() {
  breadcrumbPath.innerHTML = '';
  if (!basePath) return;

  const parts = currentPath.split('/'); // currentPath 包含 basePath
  // parts[0] 是 basePath 的名字
  
  let accumulatedPath = '';
  
  parts.forEach((part, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.textContent = ' / ';
      breadcrumbPath.appendChild(sep);
      accumulatedPath += '/' + part;
    } else {
      accumulatedPath = part;
    }

    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = part;
    
    // 闭包保存当前状态
    const targetPath = accumulatedPath;
    const targetIndex = index;
    
    item.addEventListener('click', async () => {
      // 在历史记录中回溯
      // 这里的逻辑稍微简化，直接利用 pathHistory
      // 找到匹配 targetPath 的历史记录项
      const historyIndex = pathHistory.findIndex(h => h.path === targetPath);
      if (historyIndex !== -1) {
        pathHistory = pathHistory.slice(0, historyIndex + 1);
        const entry = pathHistory[pathHistory.length - 1];
        currentPath = entry.path;
        currentHandle = entry.handle;
        await loadDirectoryContents(currentHandle);
        updateBreadcrumb();
        updateBackBtnState();
      }
    });
    
    breadcrumbPath.appendChild(item);
  });
}

function toggleSelection(itemPath) {
  if (selectedItems.has(itemPath)) {
    selectedItems.delete(itemPath);
  } else {
    selectedItems.add(itemPath);
  }
  updateSelectedItemsList();
  updateGenerateButtonState();
}

function updateSelectedItemsList() {
  selectedItemsList.innerHTML = '';
  if (selectedItems.size === 0) {
    selectedItemsList.innerHTML = '<div>未选择任何项目</div>';
    return;
  }

  Array.from(selectedItems).forEach(itemPath => {
    const div = document.createElement('div');
    div.className = 'selected-item';
    
    const text = document.createElement('span');
    text.textContent = path.relative(basePath, itemPath) || path.basename(itemPath);
    
    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.textContent = '删除';
    btn.onclick = () => {
      selectedItems.delete(itemPath);
      updateSelectedItemsList();
      updateGenerateButtonState();
      
      // 如果当前可视区域有此文件，移除高亮
      const currentFileItems = fileList.querySelectorAll('.file-item');
      currentFileItems.forEach(li => {
        const name = li.querySelector('span:last-child').textContent;
        const p = path.join(currentPath, name);
        if (p === itemPath) li.classList.remove('selected');
      });
    };
    
    div.appendChild(text);
    div.appendChild(btn);
    selectedItemsList.appendChild(div);
  });
}

function updateGenerateButtonState() {
  const disabled = selectedItems.size === 0;
  generateMdBtn.disabled = disabled;
  generateStructBtn.disabled = disabled;
}

function updateBackBtnState() {
  backBtn.disabled = pathHistory.length <= 1;
}

function showStatus(success, message) {
  statusMessage.textContent = message;
  statusMessage.className = success ? 'status success' : 'status error';
  statusMessage.classList.remove('hidden');
  setTimeout(() => statusMessage.classList.add('hidden'), 5000);
}

// 启动
init();
