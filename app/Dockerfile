# Build context for this Dockerfile is the MONOREPO ROOT, not app/ — see
# "Deploying" in ../README.md. app/tsconfig.json's `~lib/*` path alias
# resolves to ../src/*, and those files import their own dependencies
# (dotenv, googleapis) via plain Node module resolution against the repo
# root's node_modules, not app/'s. Both npm installs below are required;
# skipping the root one fails the build with "Rollup failed to resolve
# import googleapis" (verified — that's not a hypothetical).
FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000
ENV NODE_ENV=production

WORKDIR /repo

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci --omit=dev && npm cache clean --force
COPY app ./app

WORKDIR /repo/app
RUN npm run build

CMD ["npm", "run", "docker-start"]
