FROM node:20-bookworm

# 1. Tizim paketlarini (FFmpeg va Playwright uchun kerakli) o'rnatamiz
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# 2. Ishchi papkani belgilash
WORKDIR /app

# 3. Paketlarni ko'chirish
COPY package*.json ./

# 4. Backend modullarni o'rnatish
RUN npm install

# 5. Playwright brauzerini o'rnatish
RUN npx playwright install chromium

# 6. Dashboard (Frontend) kodini nusxalash va yig'ish (build)
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm install
COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# 7. Qolgan barcha backend kodlarni nusxalash
COPY . .

# 8. Render uchun portni ochish
EXPOSE 5000

# 9. Serverni ishga tushirish
CMD ["npm", "start"]
