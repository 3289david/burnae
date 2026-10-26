import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async () => {
  const locale = "kr";

  return {
    locale,
    messages: (await import("../../messages/kr.json")).default,
  };
});

