FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build -- docs/example.md

FROM nginx:alpine
COPY --from=build /app/dist/example.html /usr/share/nginx/html/index.html
EXPOSE 80
