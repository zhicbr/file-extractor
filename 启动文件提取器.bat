@echo off
echo 正在启动文件提取器...
echo 如果这是首次运行，可能需要一些时间安装依赖...

:: 检查node_modules文件夹是否存在
if not exist node_modules (
    echo 正在安装依赖，请稍等...
    call npm install
)

:: 启动应用
call npm start

pause
