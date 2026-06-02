import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient();
}

function isStaleClient(client: PrismaClient | undefined): boolean {
  return Boolean(client && !("exportHistory" in client));
}

function getPrismaClient(): PrismaClient {
  if (isStaleClient(global.prismaGlobal)) {
    void global.prismaGlobal?.$disconnect();
    global.prismaGlobal = undefined;
  }

  if (process.env.NODE_ENV !== "production") {
    if (!global.prismaGlobal) {
      global.prismaGlobal = createPrismaClient();
    }
    return global.prismaGlobal;
  }

  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
  return global.prismaGlobal;
}

const prisma = getPrismaClient();

export default prisma;
