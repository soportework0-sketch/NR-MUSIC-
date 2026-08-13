FROM node:24-bookworm

RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip curl && \
    pip3 install --break-system-packages -U yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["node", "index.js"]
