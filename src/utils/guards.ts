/** 与 server 共用的纯值守卫；保留前端命名以稳定既有导入。 */
export { isRecord, readInteger, toPositiveInteger } from "@shared/guards";
export {
  textOrEmpty as asString,
  optionalText as nullableText,
} from "@shared/guards";
