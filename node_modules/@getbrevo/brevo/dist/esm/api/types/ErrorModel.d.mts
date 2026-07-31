export interface ErrorModel {
    /** Error code displayed in case of a failure */
    code?: string | undefined;
    /** Readable message associated to the failure */
    message: string;
}
