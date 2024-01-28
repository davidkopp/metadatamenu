import MetadataMenu from "main"
import { ButtonComponent, DropdownComponent, Modal, Notice, SuggestModal, TextComponent, ToggleComponent, setIcon } from "obsidian"
import { FieldHTMLTagMap, FieldStyle as GFieldStyle, FieldStyleKey } from "src/types/dataviewTypes"
import { cleanActions } from "src/utils/modals"
import { FileClass } from "src/fileClass/fileClass"
import { insertIFieldCommand } from "src/commands/paletteCommands"
import FieldSetting from "src/settings/FieldSetting"
import { incrementVersion } from "src/settings/MetadataMenuSettings"
import { FieldType, frontmatterOnlyTypes, multiTypes, rootOnlyTypes, MultiDisplayType, getIcon, getTagName, fieldTypes, getTooltip } from "../Fields"
import { getFieldSettings } from "../Fields"
import { FieldCommand, IField, buildEmptyField, copyProperty, getField, getFieldConstructor, getNewFieldId, getOptions, removeValidationError } from "../Field"
import { Constructor } from "src/typings/types"
import { BaseOptions } from "./BaseField"

// Field Types list agnostic
// Field types specific settings agnostic
export const enum SettingLocation {
    "PluginSettings",
    "FileClassAttributeSettings"
}

export interface ISettingsModal<O extends BaseOptions> extends Modal {
    plugin: MetadataMenu;
    iconName: TextComponent;
    namePromptComponent: TextComponent;
    initialField: IField<O>;
    optionsContainer: HTMLDivElement;
    command: FieldCommand;
    addCommand: boolean;
    frontmatterListDisplay?: MultiDisplayType;
    frontmatterListDisplayContainer: HTMLDivElement;
    frontmatterOnlyTypeInfoContainer: HTMLDivElement;
    path: string;
    parentSelectContainer: HTMLDivElement
    typeSelectContainer: HTMLDivElement
    location: SettingLocation
    field: IField<O>
    isNew: boolean
    parentSetting?: FieldSetting
    parentSettingContainer?: HTMLElement
    getFileClassName(): string | undefined
    setParent(parent: IField<O> | undefined): void
    setType(fieldType: FieldType, fieldTypeLabelContainer: HTMLDivElement): void
}

class TypeSelector<O extends BaseOptions> extends SuggestModal<FieldType> {
    constructor(
        private plugin: MetadataMenu,
        private fieldSetting: ISettingsModal<O>,
        private labelContainer: HTMLDivElement
    ) {
        super(plugin.app)
        this.containerEl.addClass("metadata-menu")
    }

    getSuggestions(query: string): Array<FieldType> {
        const _fieldTypes: Array<FieldType> = []
        for (const fieldType of fieldTypes) {
            if (!rootOnlyTypes.includes(fieldType)) {
                fieldTypes.push(fieldType)
            } else {
                if (this.fieldSetting.field.isRoot()) fieldTypes.push(fieldType)
            }
        }
        return fieldTypes.filter(k => k.toLowerCase().includes(query.toLowerCase()))
    }

    renderSuggestion(value: FieldType, el: HTMLElement) {
        el.addClass("value-container");
        const iconContainer = el.createDiv({ cls: "icon-container" })
        setIcon(iconContainer, getIcon(value))
        const chipContainer = el.createDiv({ cls: "field-type-container" })
        chipContainer.createDiv({ text: value, cls: `chip ${getTagName(value)}` })
        chipContainer.createDiv({ cls: "spacer" })
        el.createDiv({ cls: "field-type-tooltip", text: getTooltip(value) })
    }

    onChooseSuggestion(item: FieldType, evt: MouseEvent | KeyboardEvent) {
        this.fieldSetting.setType(item, this.labelContainer)
    }
}

class ParentSelector<O extends BaseOptions> extends SuggestModal<IField<O>> {
    constructor(
        private plugin: MetadataMenu,
        private fieldSetting: ISettingsModal<O>,
        private compatibleParents: IField<O>[],
    ) {
        super(plugin.app)
    }

    getSuggestions(query: string): IField<O>[] | Promise<IField<O>[]> {
        const parents = this.compatibleParents.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
        return parents
    }

    renderSuggestion(parent: IField<O>, el: HTMLElement) {
        const path = getParentPath(parent)
        const display = getHierarchyDisplay(
            this.plugin,
            path,
            this.fieldSetting.getFileClassName()
        )
        el.setText(display)
    }

    onChooseSuggestion(parent: IField<O>, evt: MouseEvent | KeyboardEvent) {
        this.fieldSetting.setParent(parent)
        //TODO call setting.setParent(item) given that item is the path
    }



}

export function getHierarchyDisplay(plugin: MetadataMenu, path: string, fileClassName: string | undefined): string {
    const display = path
        .split("____")
        .map(id => getField(id, fileClassName, plugin)?.name || "")
        .join(" > ")
    return display
}

export function getParentPath<O extends BaseOptions>(item: IField<O>): string {
    const path = item.path ? item.path + "____" + item.id : item.id
    return path
}

export function buildSettingsModal<O extends BaseOptions>(
    fieldConstructor: Constructor<IField<O>>,
    plugin: MetadataMenu,
    parentSetting?: FieldSetting,
    parentSettingContainer?: HTMLElement
): Constructor<ISettingsModal<O>> {
    return class SettingsModal extends Modal implements ISettingsModal<O> {
        createSettingContainer: () => void
        validateOptions: () => boolean = () => true
        public plugin: MetadataMenu
        public iconName: TextComponent;
        public namePromptComponent: TextComponent;
        public initialField: IField<O>;
        public optionsContainer: HTMLDivElement;
        public command: FieldCommand;
        public addCommand: boolean;
        public frontmatterListDisplay?: MultiDisplayType;
        public frontmatterListDisplayContainer: HTMLDivElement;
        public frontmatterOnlyTypeInfoContainer: HTMLDivElement;
        public path: string;
        public parentSelectContainer: HTMLDivElement
        public typeSelectContainer: HTMLDivElement
        public location: SettingLocation
        public field: IField<O>
        public isNew: boolean = true;
        public fileClass?: FileClass
        public saved: boolean = false
        constructor() {
            super(plugin.app)
            this.plugin = plugin
            this.init()
        }

        private init() {
            //feed initial field with the optional existing indexed field
            this.initialField = new fieldConstructor()
            //create a blank field inbound from the existing indexed field
            this.field = new (buildEmptyField<O>(plugin, this.initialField.fileClassName, this.initialField.type))()
            // feed options with initial field options or default values
            this.initialField.options = getOptions(this.initialField) as O
            // deep copy the properties in this.field
            copyProperty(this.field, this.initialField)
            this.isNew = !this.field.id
            // get Id or create new
            this.initialField.id = this.initialField.id || getNewFieldId(this.plugin)
            this.field.id = this.initialField.id

            if (this.initialField.fileClassName) this.fileClass = this.plugin.fieldIndex.fileClassesName.get(this.initialField.fileClassName)
            if (this.fileClass) {
                this.location = SettingLocation.FileClassAttributeSettings
            } else {
                this.location = SettingLocation.PluginSettings
            }
            // path
            this.path = this.initialField.path
            // command
            console.log(this.field)
            //this.addCommand = this.field.command !== undefined;
            this.addCommand = !!this.field.command
            this.command = this.initialField.command || {
                id: this.field ? `insert__${this.field.id}` : "",
                icon: "list-plus",
                label: this.field ? `Insert ${this.field.name} field` : "",
                hotkey: undefined
            }
        }

        onOpen() { this.build() }

        private build(): void {
            this.containerEl.addClass("metadata-menu")
            if (this.field.name == "") {
                this.titleEl.setText(`Add a field and define options`);
            } else {
                this.titleEl.setText(`<PROTO> Manage settings options for ${this.field.name}`);
            };

            /* Name and parent */
            this.createnameInputContainer();

            /* Type */
            this.typeSelectContainer = this.contentEl.createDiv({ cls: "field-container" });

            /* parent select */
            this.parentSelectContainer = this.contentEl.createDiv({ cls: "field-container" })
            this.buildParentSelectContainer();
            this.contentEl.createEl("hr");

            /* Commands and display */
            this.createCommandContainer();
            this.createFrontmatterListDisplayContainer();
            const styleContainer = this.contentEl.createDiv({ cls: "field-container" })
            this.contentEl.createEl("hr");

            /* Options */
            this.optionsContainer = this.contentEl.createDiv();

            /* footer buttons*/
            cleanActions(this.contentEl, ".footer-actions")
            const footer = this.contentEl.createDiv({ cls: "footer-actions" });
            footer.createDiv({ cls: "spacer" })
            this.createSaveButton(footer);
            if (this.field) this.createRemovalBtn(footer);
            this.createCancelButton(footer);

            /* init state */
            this.createStyleSelectorContainer(styleContainer)
            this.buildTypeSelectContainer()
            this.createSettingContainer()
        }

        private createnameInputContainer(): void {
            const container = this.contentEl.createDiv({ cls: "field-container" })
            container.createDiv({ cls: "label", text: "Field Name: " });
            const input = new TextComponent(container);
            input.inputEl.addClass("with-label");
            input.inputEl.addClass("full-width");
            input.inputEl.focus();
            const name = this.field.name;
            input.setValue(name);
            input.setPlaceholder("Name of the field");
            input.onChange(value => {
                this.field.name = value;
                this.command.id = `insert__${this.field.fileClassName || "presetField"}__${value}`
                this.command.label = `Insert ${value} field`
                this.titleEl.setText(`<PROTO> Manage settings options for ${this.field.name}`);
                removeValidationError(input);
            });
            this.namePromptComponent = input
        }

        public setParent(parent: IField<O> | undefined): void {
            if (parent === undefined) {
                this.path = ""
                this.field.path = ""
            } else {
                const path = getParentPath(parent)
                this.path = path
                this.field.path = path
            }
            this.buildParentSelectContainer(parent)
            this.buildTypeSelectContainer()
        }

        public getFileClassName(): string | undefined {
            return this.fileClass?.name
        }

        private buildParentSelectContainer(_parent?: IField<O>): void {
            const parent = _parent || this.field.getFirstAncestor()
            this.parentSelectContainer.replaceChildren()
            const compatibleParents = this.field.getCompatibleParents()
            const parentName = parent
                ? getHierarchyDisplay(
                    this.plugin,
                    getParentPath(parent),
                    this.getFileClassName())
                : "-- No parent field selected --"
            this.parentSelectContainer
                .createDiv({ cls: "label" })
                .setText(`Parent:`);
            this.parentSelectContainer
                .createDiv({ cls: "spacer" })
            this.parentSelectContainer
                .createDiv({ cls: parent ? "parent-label" : "parent-label empty" })
                .setText(parentName)

            new ButtonComponent(this.parentSelectContainer)
                .setButtonText(`${!this.field.path ? "Select a parent field" : "Change parent field"}`)
                .onClick(() => {
                    new ParentSelector(this.plugin, this, compatibleParents).open()
                })
            new ButtonComponent(this.parentSelectContainer)
                .setIcon("trash")
                .onClick(() => this.setParent(undefined))

            if (!compatibleParents.length) this.parentSelectContainer.hide()
            else this.parentSelectContainer.show()
        }

        private createFrontmatterListDisplayContainer(): void {
            this.frontmatterListDisplayContainer = this.contentEl.createDiv({ cls: "field-container" })
            //label
            this.frontmatterListDisplayContainer.createDiv({ text: "Frontmatter list display type", cls: "label" });
            this.frontmatterListDisplayContainer.createDiv({ cls: "spacer" });
            //add toggler
            const frontmatterListDisplay = new DropdownComponent(this.frontmatterListDisplayContainer);
            const options: Record<string, string> = {}
            options["asArray"] = "display as array"
            options["asList"] = "display as indented list"
            options["undefined"] = `Plugin Default (${this.plugin.settings.frontmatterListDisplay})`
            frontmatterListDisplay.addOptions(options);
            switch (this.field.display) {
                case MultiDisplayType.asArray: frontmatterListDisplay.setValue("asArray"); break
                case MultiDisplayType.asList: frontmatterListDisplay.setValue("asList"); break
                case undefined: frontmatterListDisplay.setValue("undefined"); break
            }

            frontmatterListDisplay.onChange(value => {
                switch (value) {
                    case "asArray": this.frontmatterListDisplay = MultiDisplayType.asArray; break;
                    case "asList": this.frontmatterListDisplay = MultiDisplayType.asList; break;
                    case "undefined": this.frontmatterListDisplay = undefined; break;
                    default: this.frontmatterListDisplay = undefined;
                }
            });
            if (!multiTypes.includes(this.field.type)) this.frontmatterListDisplayContainer.hide()
        }

        private createCommandContainer(): void {
            const commandContainer = this.contentEl.createDiv({ cls: "field-container" })
            //label
            commandContainer.createDiv({ text: "set a command for this field?", cls: "label" });
            commandContainer.createDiv({ cls: "spacer" });
            //add command
            const addCommandToggler = new ToggleComponent(commandContainer);
            addCommandToggler.setValue(this.addCommand);

            // options
            const iconContainer = this.contentEl.createDiv({ cls: "field-container" })
            this.addCommand ? iconContainer.show() : iconContainer.hide();

            // icon
            iconContainer.createDiv({ text: "Icon name", cls: "label" })
            this.iconName = new TextComponent(iconContainer)
            this.iconName.inputEl.addClass("full-width");
            this.iconName.inputEl.addClass("with-label");
            const iconPreview = iconContainer.createDiv({ cls: "icon-preview" })
            this.iconName.setValue(this.command?.icon || "command")
            setIcon(iconPreview, this.command?.icon || "command")
            this.iconName.onChange(value => {
                this.command.icon = value;
                setIcon(iconPreview, value)
            })

            addCommandToggler.onChange(value => {
                this.addCommand = value
                this.addCommand ? iconContainer.show() : iconContainer.hide();
            });
        }

        private setLabelStyle(label: HTMLDivElement): void {
            const fieldStyle = this.field.style || {}
            Object.keys(GFieldStyle).forEach((style: keyof typeof GFieldStyle) => {
                const styleKey = FieldStyleKey[style]
                if (!!fieldStyle[styleKey]) {
                    label.addClass(styleKey)
                } else {
                    label.removeClass(styleKey)
                }
            })
        }

        private createStyleSelectorContainer(parentNode: HTMLDivElement): void {
            const styleSelectorLabel = parentNode.createDiv({ cls: "label" });
            styleSelectorLabel.setText(`Inline field style`);
            this.setLabelStyle(styleSelectorLabel);
            parentNode.createDiv({ text: "::" })
            parentNode.createDiv({ cls: "spacer" })
            const styleButtonsContainer = parentNode.createDiv({ cls: "style-buttons-container" })
            Object.keys(GFieldStyle).forEach((style: keyof typeof GFieldStyle) => {
                const styleBtnContainer = styleButtonsContainer.createEl(FieldHTMLTagMap[style], { cls: "style-button-container" })
                styleBtnContainer.createDiv({ cls: "style-btn-label", text: FieldStyleKey[style] })
                const styleBtnToggler = new ToggleComponent(styleBtnContainer)
                const fieldStyle = this.field.style || {}
                styleBtnToggler.setValue(fieldStyle[FieldStyleKey[style]])
                styleBtnToggler.onChange(v => {
                    fieldStyle[FieldStyleKey[style]] = v
                    this.field.style = fieldStyle
                    this.setLabelStyle(styleSelectorLabel);
                })
            })
        }

        private setTypeInfo(): void {
            this.frontmatterOnlyTypeInfoContainer.replaceChildren()
            if (frontmatterOnlyTypes.includes(this.field.type)) {
                const info = new ButtonComponent(this.frontmatterOnlyTypeInfoContainer)
                info.setClass("tooltip-button")
                setIcon(info.buttonEl, "info")
                info.setTooltip(`${this.field.type} field type \nare only available\nin the frontmatter section`)
            }
        }

        public setType(fieldType: FieldType, fieldTypeLabelContainer: HTMLDivElement): void {
            fieldTypeLabelContainer.setText(fieldType)
            fieldTypeLabelContainer.className = `chip ${getTagName(fieldType)}`
            this.field.fileClassName = this.fileClass?.name
            const Field = buildEmptyField(plugin, this.field.fileClassName, fieldType)
            const settingsModal = getFieldSettings(Field, fieldType, plugin, parentSetting, parentSettingContainer)
            settingsModal.field.name = this.namePromptComponent.getValue()
            settingsModal.open()
            this.close()
        }


        private buildTypeSelectContainer(): void {
            this.typeSelectContainer.replaceChildren()
            const typeSelectorContainerLabel = this.typeSelectContainer.createDiv({ cls: "label" });
            typeSelectorContainerLabel.setText(`Field type:`);
            this.typeSelectContainer.createDiv({ cls: "spacer" })
            const infoBtnContainer = this.typeSelectContainer.createDiv({ cls: "tooltip-btn" })
            const info = new ButtonComponent(infoBtnContainer)
            info.setClass("tooltip-button")
            setIcon(info.buttonEl, !(this.field.id && !this.isNew) ? "shield-alert" : "lock")
            info.setTooltip(`The field type \ncan't be modified once saved`)
            const typeNameContainer = this.typeSelectContainer
                .createDiv({ cls: "field-type-label" })
                .createDiv({ cls: `chip ${getTagName(this.field.type)}` })
            if (!this.field.id || this.isNew) {
                new ButtonComponent(this.typeSelectContainer)
                    .setButtonText("Choose a type")
                    .onClick(() => {
                        new TypeSelector(this.plugin, this, typeNameContainer).open()
                    })
            }
            this.frontmatterOnlyTypeInfoContainer = this.typeSelectContainer.createDiv({ cls: "tooltip-btn" });
            this.setTypeInfo()
            if (this.field.type) {
                typeNameContainer.setText(this.field.type);
                if (multiTypes.includes(this.field.type)) {
                    this.frontmatterListDisplayContainer.show()
                } else {
                    this.frontmatterListDisplayContainer.hide()
                }
            }
        }

        private validateFields(): boolean {
            return this.field.validateName(
                this.namePromptComponent,
                this.contentEl
            ) &&
                this.validateOptions();
        }

        private createSaveButton(container: HTMLDivElement): void {
            const saveButton = new ButtonComponent(container)
            saveButton.setTooltip("Save");
            saveButton.setIcon("checkmark");
            saveButton.onClick(async () => {
                let error = !this.validateFields();
                if (error) {
                    new Notice("Fix errors before saving.");
                    return;
                };
                if (this.addCommand) {
                    this.field.command = this.command
                    insertIFieldCommand(this.plugin, this.command, this.field, this.field.fileClassName)
                } else {
                    delete this.field.command
                }
                if (this.frontmatterListDisplay !== undefined) {
                    this.field.display = this.frontmatterListDisplay
                } else {
                    delete this.field.display
                }
                this.onSave()
                this.close();
            })
        }

        public async onSave(): Promise<void> {
            if (this.fileClass) {
                await this.fileClass.updateIAttribute(
                    this.field,
                    this.field.type,
                    this.field.name,
                    this.field.options,
                    this.field.command,
                    this.field.display,
                    this.field.style,
                    this.field.path
                );
            } else {
                this.saved = true;
                const cEF = this.plugin.presetFields.filter(p => p.id == this.field.id)[0];
                const _field = cEF ? getField(cEF.id, undefined, this.plugin) : undefined
                if (_field) {
                    copyProperty(_field, this.field);
                    this.plugin.presetFields = [...this.plugin.presetFields.filter(p => p.id !== cEF.id), _field]
                } else {
                    this.plugin.presetFields.push(this.field);
                };
                copyProperty(this.initialField, this.field)
                if (parentSetting) copyProperty(parentSetting.field, this.field);
                parentSetting?.setTextContentWithname()
                incrementVersion(this.plugin)
                await this.plugin.saveSettings();
            }
        }

        public onCancel(): void {
            this.close();
        }

        private createRemovalBtn(container: HTMLDivElement): void {
            const removeButton = new ButtonComponent(container);
            removeButton.setIcon("trash");
            removeButton.onClick(() => {
                const confirmModal = new Modal(this.plugin.app);
                confirmModal.containerEl.addClass("metadata-menu");
                confirmModal.titleEl.setText("Please confirm");
                confirmModal.contentEl.createDiv().setText(`Do you really want to remove this field?`);
                const confirmFooter = confirmModal.contentEl.createDiv({ cls: "footer-actions" });
                confirmFooter.createDiv({ cls: "spacer" })
                const confirmButton = new ButtonComponent(confirmFooter);
                confirmButton.setWarning();
                confirmButton.setIcon("checkmark");
                confirmButton.onClick(async () => {
                    if (this.field) await this.removeField();
                    confirmModal.close();
                    this.close();
                })
                const dismissButton = new ButtonComponent(confirmFooter);
                dismissButton.setIcon("cross");
                dismissButton.onClick(() => this.close());
                confirmModal.open();
            })
        }

        private async removeField() {
            if (this.fileClass) {
                if (this.field) await this.fileClass.removeIAttribute(this.field);
            } else {
                const currentExistingProperty = this.plugin.presetFields.filter(p => p.id == this.field.id)[0];
                if (currentExistingProperty) {
                    this.plugin.presetFields.remove(currentExistingProperty);
                };
                await this.plugin.saveSettings();
            }
        }

        private createCancelButton(container: HTMLDivElement): void {
            const cancelButton = new ButtonComponent(container);
            cancelButton.setIcon("cross")
            cancelButton.setTooltip("Cancel")
            cancelButton.onClick(() => this.onCancel());
        }

        onClose(): void {
            if (this.saved) {
                if (parentSettingContainer && this.saved) {
                    Object.assign(this.field, this.initialField);
                    if (!this.isNew && parentSetting) {
                        parentSetting.setTextContentWithname()
                    } else {
                        new FieldSetting(parentSettingContainer, this.field, this.plugin);
                    };
                }
            }

        }
    }
}


export function openSettings<O extends BaseOptions>(id: string, fileClassName: string | undefined, plugin: MetadataMenu, parentSetting?: FieldSetting, parentSettingContainer?: HTMLElement) {
    let Field: Constructor<IField<O>> | undefined = undefined
    let type: FieldType | undefined = "Input"
    if (!id) {
        Field = buildEmptyField(plugin, fileClassName, type)
    } else {
        [Field, type] = getFieldConstructor(id, fileClassName, plugin) || []
    }
    if (Field && type) {
        const settingsModal = getFieldSettings(Field, type, plugin, parentSetting, parentSettingContainer)
        settingsModal.open()
    }
}