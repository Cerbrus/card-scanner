FROM node:25-slim AS build
WORKDIR /repo

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
RUN yarn install --immutable

COPY . .
RUN yarn card-api:build && yarn card-front:build
RUN printf '{"api":{"core":"/api"}}' > dist/apps/card-front/browser/assets/appsettings.json
RUN node -e "const fs = require('fs'); const folder = 'dist/apps/card-front/browser'; fs.writeFileSync(folder + '/app-files.json', JSON.stringify(fs.readdirSync(folder).filter((file) => /\\.(js|css)$/.test(file))))"


FROM node:25-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3030 \
    DATABASE_PATH=/data/app.db \
    FRONTEND_PATH=/app/public

COPY --from=build /repo/dist/apps/card/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /repo/dist/apps/card/main.js ./
COPY --from=build /repo/dist/apps/card-front/browser ./public

ARG APP_VERSION=dev
ARG APP_COMMIT=
ARG APP_BUILT=
ENV APP_VERSION=$APP_VERSION \
    APP_COMMIT=$APP_COMMIT \
    APP_BUILT=$APP_BUILT

EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

USER node
CMD ["node", "main.js"]
