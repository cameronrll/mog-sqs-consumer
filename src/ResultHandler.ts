
export class ResultContext {

}

export type ResultHandler = (context: ResultContext, error: any, result?: any) => void;