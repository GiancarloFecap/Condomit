import type * as Brevo from "../../../index.mjs";
export interface GetFolderListsResponse {
    /** Number of lists in the folder */
    count?: number | undefined;
    lists?: Brevo.GetList[] | undefined;
}
