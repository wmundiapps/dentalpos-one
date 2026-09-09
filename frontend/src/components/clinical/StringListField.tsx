import { Autocomplete, TextField } from "@mui/material";

export default function StringListField({label,value,onChange,helperText,disabled=false}:{label:string;value:string[];onChange:(value:string[])=>void;helperText?:string;disabled?:boolean}){
  return <Autocomplete multiple freeSolo disabled={disabled} options={[]} value={value} onChange={(_,next)=>onChange(next.map(String).map(x=>x.trim()).filter(Boolean))} renderInput={params=><TextField {...params} label={label} helperText={helperText||"Digite e pressione Enter para adicionar"}/>}/>;
}
