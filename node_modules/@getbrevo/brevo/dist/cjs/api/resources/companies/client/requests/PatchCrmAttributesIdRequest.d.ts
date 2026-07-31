/**
 * @example
 *     {
 *         id: "id"
 *     }
 */
export interface PatchCrmAttributesIdRequest {
    /** Attribute ID */
    id: string;
    /** Attribute display label */
    label?: string;
    /** Updated labels for selectable options */
    optionsLabels?: PatchCrmAttributesIdRequest.OptionsLabels.Item[];
    /** The type of object the attribute belongs to, it cannot be updated after creation */
    objectType?: PatchCrmAttributesIdRequest.ObjectType;
}
export declare namespace PatchCrmAttributesIdRequest {
    type OptionsLabels = OptionsLabels.Item[];
    namespace OptionsLabels {
        interface Item {
            /** Internal option identifier */
            key: string;
            /** Display label for the option */
            value: string;
        }
    }
    /** The type of object the attribute belongs to, it cannot be updated after creation */
    const ObjectType: {
        readonly Companies: "companies";
        readonly Deals: "deals";
    };
    type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];
}
