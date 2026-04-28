export default function Dashboard({data,setData,date}:any){
  return (
    <div>
      <h2>Dashboard</h2>

      <h3>Steps</h3>
      <button onClick={()=>setData((p:any)=>({...p,steps:{...p.steps,[date]:5000}}))}>
        Add Steps
      </button>
      <p>{data.steps?.[date]||0}</p>

      <h3>Micronutrients</h3>
      {(data.supplements?.[date]||[]).map((s:any,i:number)=>(
        <div key={i}>{s.name} {s.value}{s.unit}</div>
      ))}

      <button onClick={()=>{
        const entry={name:'Vitamin D',value:1000,unit:'IU'}
        setData((p:any)=>({
          ...p,
          supplements:{
            ...p.supplements,
            [date]:[...(p.supplements?.[date]||[]),entry]
          }
        }))
      }}>
        Add Vitamin
      </button>
    </div>
  )
}
