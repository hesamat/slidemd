FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build -- docs/example/slides.md

FROM nginx:alpine
COPY --from=build /app/dist/slides.html /usr/share/nginx/html/index.html
EXPOSE 80
