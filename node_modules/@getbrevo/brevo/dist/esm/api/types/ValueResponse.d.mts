import type * as Brevo from "../index.mjs";
export interface ValueResponse {
    /** Array values to define the rule */
    array?: Brevo.ValueResponse[] | undefined;
    /** Boolean values for rule definition */
    boolean?: boolean | undefined;
    /** string */
    contactProperty?: string | undefined;
    /** Selected date for rule definition */
    date?: string | undefined;
    /** Selected event property for rule definition */
    eventProperty?: string | undefined;
    /** Created expression for rule definition */
    expression?: Brevo.NodeResponse | undefined;
    /** Boolean values for rule definition */
    number?: number | undefined;
    /** String values for rule definition */
    string?: string | undefined;
}
