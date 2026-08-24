export interface BIIndicator {

  id:number;

  title:string;

  value:string;

  variation:number;

  positive:boolean;

  description:string;

}

export interface AIInsight{

  id:number;

  priority:"Alta"|"Média"|"Baixa";

  title:string;

  description:string;

  recommendation:string;

}