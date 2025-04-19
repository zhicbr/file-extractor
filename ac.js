#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// ANSI 颜色代码
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

/**
 * 日志输出函数
 */
function log(message, type = 'info') {
    const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
    let colorCode;
    let prefix;
    
    switch (type) {
        case 'error':
            colorCode = colors.red;
            prefix = '错误';
            break;
        case 'warning':
            colorCode = colors.yellow;
            prefix = '警告';
            break;
        case 'success':
            colorCode = colors.green;
            prefix = '成功';
            break;
        case 'info':
        default:
            colorCode = colors.blue;
            prefix = '信息';
            break;
    }
    
    console.log(`${colorCode}[${timestamp}] [${prefix}]${colors.reset} ${message}`);
}

/**
 * 从Markdown文件中提取代码块并保存到对应文件
 * @param {string} mdFilePath - Markdown文件路径
 */
function extractAndSaveCode(mdFilePath) {
    try {
        // 检查输入文件是否存在
        if (!fs.existsSync(mdFilePath)) {
            throw new Error(`找不到指定的Markdown文件: ${mdFilePath}`);
        }
        
        log(`开始处理Markdown文件: ${mdFilePath}`, 'info');
        
        // 读取Markdown文件内容
        const content = fs.readFileSync(mdFilePath, 'utf8');
        
        // 定义正则表达式来匹配 "## 文件路径" 和后面的代码块
        const fileBlockRegex = /^## (.+?)[\r\n]+```[a-z]*[\r\n]+([\s\S]*?)```/gm;
        
        let match;
        let fileCount = 0;
        let errorCount = 0;
        
        // 遍历所有匹配项
        while ((match = fileBlockRegex.exec(content)) !== null) {
            const filePath = match[1].trim();
            const codeContent = match[2];
            
            try {
                // 确保目标目录存在
                const directory = path.dirname(filePath);
                if (directory !== '.' && !fs.existsSync(directory)) {
                    log(`创建目录: ${directory}`, 'info');
                    fs.mkdirSync(directory, { recursive: true });
                }
                
                // 检查文件是否已存在
                const fileExists = fs.existsSync(filePath);
                const action = fileExists ? '更新' : '创建';
                
                // 写入文件
                fs.writeFileSync(filePath, codeContent);
                
                log(`${action}文件: ${filePath}`, 'success');
                fileCount++;
            } catch (err) {
                log(`处理文件 ${filePath} 时出错: ${err.message}`, 'error');
                log(`错误详情: ${err.stack}`, 'error');
                errorCount++;
            }
        }
        
        if (fileCount === 0) {
            log(`没有在Markdown文件中找到符合格式的代码块`, 'warning');
        } else {
            log(`操作完成: 共处理 ${fileCount} 个文件, ${errorCount} 个错误`, 
                errorCount > 0 ? 'warning' : 'success');
        }
        
        return { fileCount, errorCount };
    } catch (err) {
        log(`处理Markdown文件时出错: ${err.message}`, 'error');
        log(`错误详情: ${err.stack}`, 'error');
        return { fileCount: 0, errorCount: 1 };
    }
}

/**
 * 主函数
 */
function main() {
    const args = process.argv.slice(2);
    
    if (args.length !== 1) {
        log('使用方法: node gs.js <markdown文件路径>', 'error');
        log('示例: node gs.js project.md', 'info');
        process.exit(1);
    }
    
    const mdFilePath = args[0] || 'changes.md';  //默认changes.md
    log(`${colors.cyan}Markdown 代码提取器${colors.reset} - 开始执行`, 'info');
    log(`工作目录: ${process.cwd()}`, 'info');
    
    const result = extractAndSaveCode(mdFilePath);
    
    if (result.errorCount > 0) {
        log(`脚本执行完成，但存在 ${result.errorCount} 个错误`, 'warning');
        process.exit(1);
    } else {
        log(`脚本执行成功，共处理 ${result.fileCount} 个文件`, 'success');
    }
}

// 执行主函数
main();