import type { RoleName, UserStatus } from "@/generated/prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      status: UserStatus;
      roles: RoleName[];
    } & DefaultSession["user"];
  }

  interface User {
    status?: UserStatus;
    roles?: RoleName[];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    status: UserStatus;
    roles: RoleName[];
  }
}
