import { Autocomplete, TextField } from "@mui/material";
import { cbhpoProcedures, procedureLabel, type DentalProcedure } from "../data/cbhpoProcedures";

export default function ProcedurePicker({label="Procedimento",value,onChange,required=false}:{label?:string;value:string;onChange:(name:string,procedure?:DentalProcedure)=>void;required?:boolean}){
  const selected=cbhpoProcedures.find(p=>p.name===value)||null;
  return <Autocomplete
    freeSolo
    options={cbhpoProcedures}
    value={selected}
    inputValue={value}
    getOptionLabel={(option)=>typeof option==="string"?option:procedureLabel(option)}
    groupBy={(option)=>typeof option==="string"?"Outros":option.category}
    onInputChange={(_,v)=>onChange(v)}
    onChange={(_,v)=>{if(typeof v==="string")onChange(v);else if(v)onChange(v.name,v);}}
    renderInput={(params)=><TextField {...params} required={required} label={label} placeholder="Digite para pesquisar na CBHPO"/>}
  />;
}
