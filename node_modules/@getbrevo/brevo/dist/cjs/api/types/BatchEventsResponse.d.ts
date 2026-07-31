/**
 * Response returned when a batch of events is processed
 */
export interface BatchEventsResponse {
    /** Status of the batch request */
    status: string;
    /** Total number of events submitted in the batch */
    total_events: number;
    /** Number of events that were successfully processed */
    successful_events: number;
    /** Number of events that failed to be processed */
    failed_events: number;
    /** List of errors for the failed events */
    errors: BatchEventsResponse.Errors.Item[];
}
export declare namespace BatchEventsResponse {
    type Errors = Errors.Item[];
    namespace Errors {
        interface Item {
            /** Index positions (0-based) of the events that caused the error */
            eventIndex?: number[] | undefined;
            /** Description of the error */
            message?: string | undefined;
        }
    }
}
