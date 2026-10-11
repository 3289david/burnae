import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
} from "@discordjs/builders";
import { ButtonStyle, SeparatorSpacingSize } from "discord-api-types/v10";

/**
 * Discord Components V2 공용 헬퍼. 빌더는 "discord.js" 전체가 아니라 가벼운
 * @discordjs/builders + discord-api-types에서만 가져온다 — "discord.js"를 통째로 import하면
 * 게이트웨이(@discordjs/ws) 코드까지 같이 번들링되는데, 거기엔 zlib-sync 같은 네이티브 의존성이
 * 있어서 Next.js 앱(게이트웨이 연결이 전혀 필요 없는 쪽)에서 빌드가 깨진다.
 *
 * 빌더들은 게이트웨이 연결 없이도 순수하게 JSON을 만들어내므로, 봇 프로세스(src/bot)뿐 아니라
 * Next.js 앱에서 REST로 메시지를 올리는 쪽(discordBoards.ts, provisioning.ts 등)에서도 이 모듈을
 * 그대로 쓴다 — .toJSON()한 결과를 REST 요청 body의 components 배열에 그대로 넣으면 된다.
 *
 * V2 메시지는 content/embeds를 전혀 쓸 수 없고 components만 쓸 수 있다 — discord.js로 보낼 땐
 * flags에 MessageFlags.IsComponentsV2를, raw REST로 보낼 땐 COMPONENTS_V2_FLAG 비트를 더해야 한다.
 */
export const BRAND_COLOR = 0xff6b35;

/** raw REST payload(discordNotify.ts)에서 flags 필드에 더할 IS_COMPONENTS_V2 비트 */
export const COMPONENTS_V2_FLAG = 1 << 15;

export function panel(color: number = BRAND_COLOR): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(color);
}

export function heading(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(`### ${content}`);
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

/** 디스코드 마크다운의 "-# " 문법 — 임베드 footer와 비슷하게 작은 글씨로 보인다 */
export function subtext(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(`-# ${content}`);
}

export function divider(large = false): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

export function linkButton(label: string, url: string, emoji?: string): ButtonBuilder {
  const b = new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
  if (emoji) b.setEmoji({ name: emoji });
  return b;
}

export function actionButton(customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, emoji?: string): ButtonBuilder {
  const b = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji({ name: emoji });
  return b;
}

export function buttonRow(...buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

/** 텍스트 한 줄(들) + 오른쪽에 버튼(또는 썸네일) 하나를 붙이는 "Section" — 임베드의 inline field 대용 */
export function section(lines: string | string[], accessory: ButtonBuilder | ThumbnailBuilder): SectionBuilder {
  const arr = Array.isArray(lines) ? lines : [lines];
  const s = new SectionBuilder();
  for (const line of arr) s.addTextDisplayComponents(text(line));
  if (accessory instanceof ThumbnailBuilder) s.setThumbnailAccessory(accessory);
  else s.setButtonAccessory(accessory);
  return s;
}

export {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
};
