# NanoClaw (🐾) 全量 Docker 化方案
FROM node:22-bullseye

# 安装构建依赖（用于编译 better-sqlite3 等原生模块）及系统工具
RUN apt-get update && apt-get install -y 
    python3 
    make 
    g++ 
    git 
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制依赖定义并安装
COPY package*.json ./
RUN npm install

# 复制项目源码
COPY . .

# 编译 TypeScript 源码
RUN npm run build

# 创建数据存储目录并设置权限
RUN mkdir -p data store/auth

# 定义持久化卷
# - /app/data: 存储数据库和日志
# - /app/store/auth: 存储 WhatsApp 登录会话
VOLUME ["/app/data", "/app/store/auth"]

# 暴露端口（如有需要，目前主要通过 WhatsApp 交互）
# EXPOSE 3000

# 启动主程序
CMD ["node", "dist/index.js"]
