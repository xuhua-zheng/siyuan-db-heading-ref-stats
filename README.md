# Heading Ref Sync

Sync block reference names under document headings into matching database text fields.

In short: if a database text field is named `Related people` and the bound document has a heading named `1.2 Related people`, right-clicking the database item can write the block reference names under that heading back into the `Related people` field.

The plugin only reads existing block references and writes database text fields. It does not copy content, create blocks, modify document content, or create database fields.

## Features

- Right-click a database item: `Plugin > Sync heading refs`.
- Right-click selected database items: `Plugin > Sync selected heading refs`.
- Text field names are the matching rule: each text field is matched against same-name headings in the bound document.
- All heading levels are supported, from H1 to H6.
- Leading heading numbers are ignored, so `1.2 Related people` can match the field `Related people`.
- Referenced blocks are deduplicated by target block ID by default.

## Usage

1. Create text fields in the database, such as `Related people`, `References`, or `Related projects`.
2. Bind the database item to its document.
3. Add a same-name heading in the document, such as `1.2 Related people`.
4. Put block references under that heading.
5. Return to the database, right-click the item, and choose `Plugin > Sync heading refs`.

After sync, the plugin joins the reference names with the configured separator and writes them into the matching text field.

## Rules

- Sync only runs from the database item context menu.
- The plugin does not watch document changes or run background auto sync.
- Only database text fields are written. Other field types are ignored.
- Text fields without a matching heading are left unchanged.
- If a matching heading exists but has no block references, the matched field is written as empty.
- Multiple same-name headings in one document are merged.
- Database writes use SiYuan public attribute-view APIs and do not depend on the database page being open.

## Settings

- Name separator: default `、`.
- Deduplicate by target block: enabled by default.

## Notes

This plugin was generated with AI assistance. The author tested, adjusted, packaged, and maintains it.

The plugin only uses SiYuan's public APIs. It does not modify the SiYuan kernel or change native database behavior.

For issues or suggestions, use GitHub Issues or email `1092242849@qq.com`.

If this plugin helps you, support is welcome:

| WeChat Pay | Alipay |
| --- | --- |
| ![WeChat Pay QR code](/plugins/siyuan-db-heading-ref-stats/assets/wechat-pay.png) | ![Alipay QR code](/plugins/siyuan-db-heading-ref-stats/assets/alipay.jpg) |

## Build

```bash
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run build
```

The production build creates `package.zip`.
