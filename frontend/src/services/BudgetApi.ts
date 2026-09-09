const API_BASE=(import.meta.env.VITE_API_URL||"http://localhost:3000/api").replace(/\/$/,"");
function headers(){const token=localStorage.getItem("accessToken")||localStorage.getItem("token")||localStorage.getItem("dentalpos.accessToken")||localStorage.getItem("dentalpos.token");const clinicId=localStorage.getItem("dentalpos.clinicId");return {"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{ }),...(clinicId?{"X-Clinic-ID":clinicId}:{})}}
async function req<T>(p:string,i?:RequestInit):Promise<T>{const r=await fetch(`${API_BASE}${p}`,{...i,headers:{...headers(),...(i?.headers||{})}});if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b.error||`Erro HTTP ${r.status}`)}return r.status===204?undefined as T:r.json()}
export type BudgetRow={id:string;patientId:string;description:string;totalAmount:number;installments:number;installmentValue:number;status:string;discountPercent:number;entryAmount:number;monthlyRatePercent:number;paymentMethod:string;paymentProvider:string;validUntil:string;patient?:{fullName:string}};
export const listBudgets=()=>req<BudgetRow[]>('/budgets');
export const createBudget=(data:any)=>req<BudgetRow>('/budgets',{method:'POST',body:JSON.stringify(data)});
export const approveBudget=(id:string)=>req<BudgetRow>(`/budget/${id}/approve`,{method:'POST',body:'{}'});
export const cancelBudget=(id:string)=>req<BudgetRow>(`/budget/${id}`,{method:'DELETE'});
