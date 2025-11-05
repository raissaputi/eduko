# --- dev image running Vite dev server ---
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
# pick your pm: npm, pnpm, yarn; here we use npm by default
RUN npm install

# copy source at runtime via volume for hot reload (compose)
EXPOSE 5173
# Vite dev server binding to all interfaces + no strict host check
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
