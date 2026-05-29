import {fetchPost, Plugin, Setting, showMessage} from "siyuan";
import type {IMenu} from "siyuan";
import "./index.scss";

const STORAGE_NAME = "settings";
const CUSTOM_SY_AV_VIEW = "custom-sy-av-view";
const DEFAULT_NAME_SEPARATOR = "、";
const HEADING_REF_STATS_ICON = `<svg class="b3-menu__icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h7"/><path d="M4 9h10"/><path d="M4 12.5h7"/><path d="M14.5 5.5h3.8c1 0 1.7.8 1.7 1.7v9.6c0 1-.8 1.7-1.7 1.7H5.7c-1 0-1.7-.8-1.7-1.7V15"/><path d="M9.5 18.5c1.2-2.4 3-3.9 5.4-4.4"/><path d="m13.1 11.8 2 2.3-2.3 2"/><circle cx="17.7" cy="9.7" r="1.8"/></svg>`;

interface PluginSettings {
    nameSeparator: string;
    deduplicateByTargetBlock: boolean;
}

interface SiyuanResponse<T> {
    code: number;
    msg?: string;
    data: T;
}

interface AVRenderData {
    id: string;
    name: string;
    viewID: string;
    viewType: string;
    view: AVView;
}

interface AVView {
    rows?: AVRow[];
    cards?: AVCard[];
    groups?: AVView[];
}

interface AVRow {
    id: string;
    cells: AVCell[];
}

interface AVCard {
    id: string;
    values: AVCell[];
}

interface AVCell {
    id: string;
    valueType: string;
    value?: AVCellValue;
}

interface AVCellValue {
    id?: string;
    keyID?: string;
    blockID?: string;
    type: string;
    isDetached?: boolean;
    block?: {
        id?: string;
        content?: string;
    };
    text?: {
        content: string;
    };
}

interface AVColumn {
    id: string;
    name: string;
    type: string;
}

interface SyncRecord {
    itemID: string;
    cells: AVCell[];
}

interface SyncTarget {
    itemID: string;
    boundBlockID: string;
}

interface HeadingRefStats {
    headingIDs: string[];
    refIDs: string[];
    refNames: string[];
}

interface BatchValue {
    keyID: string;
    itemID: string;
    value: AVCellValue;
}

interface SyncResult {
    scanned: number;
    fields: number;
}

interface BlockRootRow {
    id: string;
    root_id?: string;
}

interface HeadingRow {
    id: string;
    content?: string;
    markdown?: string;
}

interface RefRow {
    id?: string;
    block_id?: string;
    def_block_id?: string;
    content?: string;
    markdown?: string;
    def_content?: string;
    def_markdown?: string;
}

interface AVMenuDetail {
    menu?: {
        addItem(item: IMenu): void;
    };
    element?: Element;
    selectRowElements?: Iterable<Element> | ArrayLike<Element>;
}

const defaultSettings: PluginSettings = {
    nameSeparator: DEFAULT_NAME_SEPARATOR,
    deduplicateByTargetBlock: true,
};

export default class DbHeadingRefStatsPlugin extends Plugin {
    private settingsData: PluginSettings = {...defaultSettings};
    private nameSeparatorInput?: HTMLInputElement;
    private deduplicateInput?: HTMLInputElement;
    private avMenuHandler = (event: CustomEvent) => this.addAVMenuItem(event);

    async onload() {
        await this.loadSettings();
        this.eventBus.on("open-menu-av", this.avMenuHandler);

        this.setting = new Setting({
            confirmCallback: () => {
                this.saveSettingsFromInputs().catch((error) => this.showError(error));
            },
        });

        this.addSettings();
    }

    onunload() {
        this.eventBus.off("open-menu-av", this.avMenuHandler);
    }

    uninstall() {
        this.removeData(STORAGE_NAME);
    }

    private addSettings() {
        this.setting.addItem({
            title: this.i18n.nameSeparator,
            description: this.i18n.nameSeparatorDesc,
            createActionElement: () => {
                this.nameSeparatorInput = this.createTextInput(this.settingsData.nameSeparator, DEFAULT_NAME_SEPARATOR);
                return this.nameSeparatorInput;
            },
        });

        this.setting.addItem({
            title: this.i18n.deduplicateByTargetBlock,
            description: this.i18n.deduplicateByTargetBlockDesc,
            createActionElement: () => {
                this.deduplicateInput = this.createSwitch(this.settingsData.deduplicateByTargetBlock);
                return this.deduplicateInput;
            },
        });
    }

    private async loadSettings() {
        this.data[STORAGE_NAME] = {...defaultSettings};
        try {
            await this.loadData(STORAGE_NAME);
        } catch (error) {
            console.debug(`[${this.name}] load settings failed`, error);
        }
        this.settingsData = this.normalizeSettings(this.data[STORAGE_NAME]);
    }

    private async saveSettingsFromInputs() {
        this.settingsData = this.normalizeSettings({
            nameSeparator: this.nameSeparatorInput?.value,
            deduplicateByTargetBlock: !!this.deduplicateInput?.checked,
        });
        await this.saveData(STORAGE_NAME, this.settingsData);
        showMessage(this.i18n.settingsSaved);
    }

    private normalizeSettings(raw: unknown): PluginSettings {
        const data = raw as Partial<PluginSettings> | undefined;
        const separator = typeof data?.nameSeparator === "string" ? data.nameSeparator : DEFAULT_NAME_SEPARATOR;
        return {
            nameSeparator: separator || DEFAULT_NAME_SEPARATOR,
            deduplicateByTargetBlock: typeof data?.deduplicateByTargetBlock === "boolean"
                ? data.deduplicateByTargetBlock
                : defaultSettings.deduplicateByTargetBlock,
        };
    }

    private createTextInput(value: string, placeholder: string) {
        const input = document.createElement("input");
        input.className = "b3-text-field fn__block heading-ref-stats__field";
        input.value = value;
        input.placeholder = placeholder;
        return input;
    }

    private createSwitch(checked: boolean) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "b3-switch fn__flex-center";
        input.checked = checked;
        return input;
    }

    private addAVMenuItem(event: CustomEvent) {
        const detail = event.detail as AVMenuDetail | undefined;
        const avElement = this.getAVElement(detail?.element);
        const itemIDs = detail ? this.getMenuItemIDs(detail) : [];
        if (!detail?.menu || !avElement || itemIDs.length === 0) {
            return;
        }

        detail.menu.addItem({
            id: "syncHeadingRefStats",
            iconHTML: HEADING_REF_STATS_ICON,
            label: itemIDs.length > 1 ? this.i18n.syncSelectedHeadingRefStats : this.i18n.syncHeadingRefStats,
            click: () => {
                this.syncSelectedDatabaseItems(avElement, itemIDs).catch((error) => this.showError(error));
            },
        });
    }

    private async syncSelectedDatabaseItems(element: HTMLElement, itemIDs: string[]) {
        const result = await this.syncAVItems(element, itemIDs);
        this.showSyncResult(result);
    }

    private async syncAVItems(element: HTMLElement, itemIDs: string[]): Promise<SyncResult> {
        const avID = element.getAttribute("data-av-id") || "";
        if (!avID) {
            showMessage(this.i18n.noCurrentDatabase);
            return {scanned: 0, fields: 0};
        }

        const [renderData, fields] = await Promise.all([
            this.renderAttributeView(element),
            this.getAttributeViewKeysByAvID(avID),
        ]);
        const textFields = fields.filter((field) => field.type === "text" && this.normalizeComparableText(field.name));
        if (textFields.length === 0) {
            showMessage(this.i18n.noTextFields);
            return {scanned: 0, fields: 0};
        }

        const selectedIDs = new Set(itemIDs.filter(Boolean));
        const rows = this.collectBoundRows(this.collectRecords(renderData.view))
            .filter((row) => selectedIDs.has(row.itemID) || selectedIDs.has(row.boundBlockID));
        if (rows.length === 0) {
            showMessage(this.i18n.noRows);
            return {scanned: 0, fields: 0};
        }

        const statsByBoundBlockID = await this.collectStatsForBoundBlocks(
            rows.map((row) => row.boundBlockID),
            textFields.map((field) => field.name),
        );
        const updates: BatchValue[] = [];

        for (const row of rows) {
            const statsByTitle = statsByBoundBlockID.get(row.boundBlockID) || new Map<string, HeadingRefStats>();
            for (const field of textFields) {
                const stats = statsByTitle.get(this.normalizeComparableText(field.name));
                if (!stats) {
                    continue;
                }
                updates.push({
                    keyID: field.id,
                    itemID: row.itemID,
                    value: this.createTextValue(field.id, row.itemID, stats.refNames.join(this.settingsData.nameSeparator)),
                });
            }
        }

        if (updates.length > 0) {
            await this.updateCells(avID, updates);
        }
        return {scanned: rows.length, fields: updates.length};
    }

    private collectRecords(view: AVView): SyncRecord[] {
        const records: SyncRecord[] = [];
        for (const row of view.rows || []) {
            records.push({itemID: row.id, cells: row.cells || []});
        }
        for (const card of view.cards || []) {
            records.push({itemID: card.id, cells: card.values || []});
        }
        for (const group of view.groups || []) {
            records.push(...this.collectRecords(group));
        }
        return records;
    }

    private collectBoundRows(records: SyncRecord[]) {
        const rows: SyncTarget[] = [];
        for (const record of records) {
            const blockCell = record.cells.find((cell) => this.isBoundBlockCell(cell));
            const boundBlockID = blockCell?.value?.block?.id || "";
            if (!boundBlockID) {
                continue;
            }
            rows.push({itemID: record.itemID, boundBlockID});
        }
        return rows;
    }

    private isBoundBlockCell(cell: AVCell) {
        return (cell.valueType === "block" || cell.value?.type === "block") &&
            !!cell.value?.block?.id &&
            !cell.value.isDetached;
    }

    private async collectStatsForBoundBlocks(boundBlockIDs: string[], headingTitles: string[]) {
        const uniqueIDs = Array.from(new Set(boundBlockIDs.filter(Boolean)));
        const rootByBoundID = await this.resolveDocumentRootIDs(uniqueIDs);
        const statsByRootID = new Map<string, Map<string, HeadingRefStats>>();

        for (const boundBlockID of uniqueIDs) {
            const rootID = rootByBoundID.get(boundBlockID) || boundBlockID;
            if (!statsByRootID.has(rootID)) {
                statsByRootID.set(rootID, await this.collectStatsByHeadingTitleForDocument(rootID, headingTitles));
            }
        }

        const result = new Map<string, Map<string, HeadingRefStats>>();
        for (const boundBlockID of uniqueIDs) {
            const rootID = rootByBoundID.get(boundBlockID) || boundBlockID;
            result.set(boundBlockID, statsByRootID.get(rootID) || new Map<string, HeadingRefStats>());
        }
        return result;
    }

    private async collectStatsByHeadingTitleForDocument(rootID: string, headingTitles: string[]) {
        const titleSet = new Set(headingTitles.map((title) => this.normalizeComparableText(title)).filter(Boolean));
        const headings = await this.findMatchingHeadings(rootID, titleSet);
        const headingsByTitle = new Map<string, HeadingRow[]>();

        for (const heading of headings) {
            const title = this.normalizeComparableText(this.getHeadingTitle(heading));
            const items = headingsByTitle.get(title) || [];
            items.push(heading);
            headingsByTitle.set(title, items);
        }

        const result = new Map<string, HeadingRefStats>();
        for (const [title, matchedHeadings] of headingsByTitle) {
            const sectionBlockIDs = new Set<string>();
            for (const heading of matchedHeadings) {
                const ids = await this.getHeadingSectionBlockIDs(heading.id);
                ids.forEach((id) => sectionBlockIDs.add(id));
            }

            const refs = await this.collectBlockRefs(Array.from(sectionBlockIDs));
            result.set(title, this.buildStats(matchedHeadings.map((heading) => heading.id), refs));
        }
        return result;
    }

    private async findMatchingHeadings(rootID: string, titleSet: Set<string>) {
        if (titleSet.size === 0) {
            return [];
        }

        const rows = await this.post<HeadingRow[]>("/api/query/sql", {
            stmt: `SELECT id, content, markdown FROM blocks WHERE root_id=${this.sqlString(rootID)} AND type='h' ORDER BY sort`,
        });
        return (rows || []).filter((row) => titleSet.has(this.normalizeComparableText(this.getHeadingTitle(row))));
    }

    private async getHeadingSectionBlockIDs(headingID: string) {
        const directIDs = await this.post<string[]>("/api/block/getHeadingChildrenIDs", {id: headingID});
        return this.collectDescendantBlockIDs(directIDs || []);
    }

    private async collectDescendantBlockIDs(blockIDs: string[]) {
        const ids = Array.from(new Set(blockIDs.filter(Boolean)));
        if (ids.length === 0) {
            return [];
        }

        const quotedIDs = ids.map((id) => this.sqlString(id)).join(",");
        try {
            const rows = await this.post<Array<{id: string}>>("/api/query/sql", {
                stmt: `WITH RECURSIVE tree(id) AS (SELECT id FROM blocks WHERE id IN (${quotedIDs}) UNION ALL SELECT b.id FROM blocks AS b JOIN tree AS t ON b.parent_id=t.id) SELECT id FROM tree`,
            });
            return Array.from(new Set((rows || []).map((row) => row.id).filter(Boolean)));
        } catch (error) {
            console.debug(`[${this.name}] recursive descendant query failed`, error);
            return ids;
        }
    }

    private async collectBlockRefs(blockIDs: string[]) {
        const ids = Array.from(new Set(blockIDs.filter(Boolean)));
        if (ids.length === 0) {
            return [];
        }

        const quotedIDs = ids.map((id) => this.sqlString(id)).join(",");
        return this.post<RefRow[]>("/api/query/sql", {
            stmt: `SELECT r.id, r.block_id, r.def_block_id, r.content, r.markdown, b.content AS def_content, b.markdown AS def_markdown FROM refs AS r LEFT JOIN blocks AS b ON b.id=r.def_block_id WHERE r.block_id IN (${quotedIDs}) ORDER BY r.id`,
        });
    }

    private buildStats(headingIDs: string[], refs: RefRow[]): HeadingRefStats {
        const refIDs: string[] = [];
        const refNames: string[] = [];
        const seen = new Set<string>();

        for (const ref of refs || []) {
            const dedupeKey = this.settingsData.deduplicateByTargetBlock
                ? ref.def_block_id || ref.markdown || ref.content || ""
                : ref.id || `${ref.block_id}:${ref.def_block_id}:${ref.markdown}`;
            if (dedupeKey && seen.has(dedupeKey)) {
                continue;
            }
            if (dedupeKey) {
                seen.add(dedupeKey);
            }

            const refID = ref.def_block_id || "";
            const name = this.getRefName(ref);
            refIDs.push(refID);
            refNames.push(name || refID);
        }

        return {headingIDs, refIDs, refNames};
    }

    private getRefName(ref: RefRow) {
        return this.cleanDisplayText(ref.content || "") ||
            this.cleanDisplayText(ref.def_content || "") ||
            this.cleanMarkdownText(ref.markdown || "") ||
            this.cleanMarkdownText(ref.def_markdown || "") ||
            "";
    }

    private getHeadingTitle(row: HeadingRow) {
        const content = this.cleanDisplayText(row.content || "");
        if (content) {
            return content;
        }
        return this.cleanMarkdownHeading(row.markdown || "");
    }

    private cleanMarkdownHeading(markdown: string) {
        return this.cleanMarkdownText(markdown.replace(/^\s{0,3}#{1,6}\s*/, ""));
    }

    private cleanMarkdownText(markdown: string) {
        const blockRef = markdown.match(/\(\([0-9]{14}-[a-z0-9]{7}\s+["']?([^"')]+)["']?\)\)/i);
        const value = blockRef?.[1] || markdown.split(/\r?\n/)[0] || "";
        return this.cleanDisplayText(value.replace(/\s*\{:[\s\S]*\}\s*$/, ""));
    }

    private cleanDisplayText(value: string) {
        return this.decodeHtml(value)
            .replace(/<[^>]+>/g, "")
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    private normalizeComparableText(value: string) {
        return this.stripLeadingHeadingNumber(this.cleanDisplayText(value));
    }

    private stripLeadingHeadingNumber(value: string) {
        return value
            .replace(/^\s*(?:(?:\d+(?:[.．]\d+)+(?:[.．、)）])?)|(?:\d+[.．、)）])|(?:[一二三四五六七八九十百千万]+[.．、)）]))\s*/u, "")
            .trim();
    }

    private async resolveDocumentRootIDs(blockIDs: string[]) {
        const result = new Map<string, string>();
        blockIDs.forEach((id) => result.set(id, id));
        if (blockIDs.length === 0) {
            return result;
        }

        const rows = await this.post<BlockRootRow[]>("/api/query/sql", {
            stmt: `SELECT id, root_id FROM blocks WHERE id IN (${blockIDs.map((id) => this.sqlString(id)).join(",")})`,
        });
        for (const row of rows || []) {
            if (row.id) {
                result.set(row.id, row.root_id || row.id);
            }
        }
        return result;
    }

    private createTextValue(keyID: string, itemID: string, content: string): AVCellValue {
        return {
            keyID,
            blockID: itemID,
            type: "text",
            text: {content},
        };
    }

    private async updateCells(avID: string, values: BatchValue[]) {
        try {
            await this.post("/api/av/batchSetAttributeViewBlockAttrs", {
                avID,
                values,
            });
            return;
        } catch (error) {
            console.debug(`[${this.name}] batch update failed, falling back`, error);
        }

        for (const value of values) {
            await this.post("/api/av/setAttributeViewBlockAttr", {
                avID,
                ...value,
            });
        }
    }

    private async renderAttributeView(element: HTMLElement) {
        return this.post<AVRenderData>("/api/av/renderAttributeView", {
            id: element.getAttribute("data-av-id") || "",
            blockID: element.getAttribute("data-node-id") || "",
            viewID: this.getViewID(element),
            pageSize: -1,
            createIfNotExist: false,
        });
    }

    private async getAttributeViewKeysByAvID(avID: string) {
        const fields = await this.post<AVColumn[]>("/api/av/getAttributeViewKeysByAvID", {avID});
        return fields || [];
    }

    private getViewID(element: HTMLElement) {
        return element.getAttribute(CUSTOM_SY_AV_VIEW) ||
            element.querySelector(".layout-tab-bar .item--focus")?.getAttribute("data-id") ||
            "";
    }

    private getMenuItemIDs(detail: AVMenuDetail) {
        return Array.from(detail.selectRowElements || [])
            .map((element) => this.getAVRowItemID(element))
            .filter((id) => id.length > 0);
    }

    private getAVRowItemID(element: Element) {
        return element.getAttribute("data-id") ||
            element.querySelector('[data-dtype="block"] .av__celltext')?.getAttribute("data-id") ||
            "";
    }

    private getAVElement(element?: Element) {
        if (!element) {
            return null;
        }
        const avElement = element.closest(".av[data-av-id]");
        return avElement instanceof HTMLElement ? avElement : null;
    }

    private post<T>(url: string, data: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            fetchPost(url, data, (response: SiyuanResponse<T>) => {
                if (response.code !== 0) {
                    reject(new Error(response.msg || `${url} failed with code ${response.code}`));
                    return;
                }
                resolve(response.data);
            });
        });
    }

    private sqlString(value: string) {
        return `'${value.replace(/'/g, "''")}'`;
    }

    private decodeHtml(value: string) {
        const textarea = document.createElement("textarea");
        textarea.innerHTML = value;
        return textarea.value;
    }

    private showSyncResult(result: SyncResult) {
        showMessage(this.i18n.syncSummary.replace("${scanned}", `${result.scanned}`).replace("${fields}", `${result.fields}`));
    }

    private showError(error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        showMessage(`${this.name}: ${message}`);
    }
}
