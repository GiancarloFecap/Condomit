import type * as Brevo from "../../../index.mjs";
export interface GetFoldersResponse {
    /** Number of folders available in your account */
    count?: number | undefined;
    folders?: Brevo.GetFolder[] | undefined;
}
