import MetadataMenu from "main";
import { FieldStyleLabel } from "src/types/dataviewTypes";
import { FieldType, MultiDisplayType, multiTypes } from "../types/fieldTypes"
import NestedField from "./fieldManagers/NestedField";

export interface FieldCommand {
    id: string,
    label: string,
    icon: string,
    hotkey?: string
}

class Field {

    constructor(
        public name: string = "",
        public options: Record<string, any> = {},
        public id: string = "",
        public type: FieldType = FieldType.Input,
        public fileClassName?: string,
        public command?: FieldCommand,
        public display?: MultiDisplayType,
        public style?: Record<keyof typeof FieldStyleLabel, boolean>,
        public parent?: string
    ) { };

    public getDisplay(plugin: MetadataMenu): MultiDisplayType {
        if (multiTypes.includes(this.type)) {
            return this.display || plugin.settings.frontmatterListDisplay
        } else {
            return MultiDisplayType.asArray
        }
    }

    static getFieldFromId(plugin: MetadataMenu, id: string, fileClassName?: string): Field | undefined {
        let field: Field | undefined = undefined;
        if (fileClassName) {
            const index = plugin.fieldIndex
            field = index.fileClassesFields
                .get(fileClassName)?.find(field => field.type === FieldType.Nested && field.id === id)

        } else {
            const _field = plugin.settings.presetFields
                .find(field => field.type === FieldType.Nested && field.id === id)
            if (_field) {
                field = new Field();
                Object.assign(field, _field);
            }
        }
        return field
    }

    public hasItselfAsAncestor(plugin: MetadataMenu, childId: string): boolean {
        if (!this.parent) {
            return false
        } else {
            if (this.parent === childId) {
                return true;
            } else {
                const field = Field.getFieldFromId(plugin, this.parent, this.fileClassName)
                return field?.hasItselfAsAncestor(plugin, childId) || false
            }
        }
    }

    public getCompatibleParentFields(plugin: MetadataMenu): { id: string, path: string }[] {
        const otherNestedFields = this.getOtherNestedFields(plugin)
        if (this.type !== FieldType.Nested) {
            return otherNestedFields
        } else {
            return otherNestedFields.filter(_field => {
                const field = Field.getFieldFromId(plugin, _field.id, this.fileClassName)
                return !field?.hasItselfAsAncestor(plugin, this.id)
            })
        }
    }

    public getPath(plugin: MetadataMenu, fieldId: string): string {
        const field = Field.getFieldFromId(plugin, fieldId, this.fileClassName) as Field
        if (!field.parent) {
            return field.name
        } else {
            const parent = Field.getFieldFromId(plugin, field.parent, this.fileClassName) as Field
            return parent.getPath(plugin, parent!.id) + ` > ${field.name}`
        }
    }

    public getOtherNestedFields(plugin: MetadataMenu): { id: string, path: string }[] {
        let nestedFields: Field[]
        if (this.fileClassName) {
            const index = plugin.fieldIndex
            nestedFields = index.fileClassesFields
                .get(this.fileClassName)?.filter(field => field.type === FieldType.Nested && field.id !== this.id) || []

        } else {
            nestedFields = plugin.settings.presetFields
                .filter(field => field.type === FieldType.Nested && field.id !== this.id)
        }
        return nestedFields.map(_field => {
            const field = Field.getFieldFromId(plugin, _field.id, this.fileClassName) as Field
            return {
                id: field.id,
                path: field.getPath(plugin, field.id)
            }
        })
    }

    // il ne faut pas proposer des "compatibleParent" si le field en question figure parmis les ancetres
    // il faut mettre l'id en tant que parent

    static copyProperty(target: Field, source: Field) {
        target.id = source.id;
        target.name = source.name;
        target.type = source.type
        Object.keys(source.options).forEach(k => {
            target.options[k] = source.options[k];
        });
        Object.keys(target.options).forEach(k => {
            if (!Object.keys(source.options).includes(k)) {
                delete target.options[k];
            };
        });
        target.command = source.command
        target.display = source.display
        target.style = source.style
        target.parent = source.parent
    };

    public static createDefault(name: string): Field {
        const field = new Field();
        field.type = FieldType.Input;
        field.name = name;
        return field;
    }
};

export default Field;