/**
 * 四源上游固定地址与 SPOC 固定查询参数，见 docs/api.md。
 * 业务模块、派生流程与认证会话共用，避免同一地址多处维护。
 */

export const BYXT_BASE_URL = "https://byxt.buaa.edu.cn/jwapp/sys/homeapp/";
export const BYXT_REFERER_URL =
  "https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html";
export const BYXT_ORIGIN = "https://byxt.buaa.edu.cn";

export const SPOC_BASE_URL = "https://spoc.buaa.edu.cn/spocnewht/";
export const SPOC_REFERER_URL =
  "https://spoc.buaa.edu.cn/spocnew/common/zycskzy";
export const SPOC_ORIGIN = "https://spoc.buaa.edu.cn";

export const BYKC_BASE_URL = "https://bykc.buaa.edu.cn/sscv/";
export const BYKC_REFERER_URL = "https://bykc.buaa.edu.cn/system/course-select";
export const BYKC_ORIGIN = "https://bykc.buaa.edu.cn";

export const YGDK_BASE_URL = "https://ygdk.buaa.edu.cn/api";
export const YGDK_OAUTH_URL =
  "https://app.buaa.edu.cn/uc/api/oauth/index?redirect=https%3A%2F%2Fygdk.buaa.edu.cn%2F%23%2Fhome&appid=200230221144501510&state=STATE&qrcode=1";

/** docs/api.md 2.2 的 SPOC 固定查询参数，不是部署密钥。 */
export const SPOC_TERM_PARAM =
  "YHrxtTavu6raCwC0/qdgYffB9evWHBkTng/XS4W6j3f/TPo02iEPSoegscDTRNzIPRG49o3RHl4JiFCXAiBkkA==";
export const SPOC_TERM_LIST_PARAM =
  "i7EJ5uwkaEi8s6f4BMZ1s6AGydpvLhbTAgbcrwrBm3mHUdM6nVRsLdleJwUr0EA+yaitJdz0UzXBlTucOn7myg==";
