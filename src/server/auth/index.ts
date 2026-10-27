import NextAuth from "next-auth";
import { cache } from "react";

import { guangyuAuthConfig } from "./guangyu-config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(guangyuAuthConfig);

const auth = cache(uncachedAuth);

export { auth, handlers, signIn, signOut };
