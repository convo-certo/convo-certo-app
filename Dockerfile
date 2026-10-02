FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/build/client ./build/client
COPY --from=build /app/scripts/serve-web.mjs ./scripts/serve-web.mjs
RUN chmod -R a+rX /app/build/client /app/scripts/serve-web.mjs
USER node
EXPOSE 3000
CMD ["node", "scripts/serve-web.mjs", "--host", "0.0.0.0", "--port", "3000", "--root", "build/client"]
