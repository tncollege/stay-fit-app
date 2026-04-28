export default function Nutrition({data,setData,date}:any){
  return (
    <div>
      <h2>Nutrition</h2>

      <button onClick={()=>{
        const meal={name:'Rice',calories:200}
        setData((p:any)=>({
          ...p,
          meals:{
            ...p.meals,
            [date]:[...(p.meals?.[date]||[]),meal]
          }
        }))
      }}>
        Add Food
      </button>

      {(data.meals?.[date]||[]).map((m:any,i:number)=>(
        <div key={i}>{m.name} {m.calories}</div>
      ))}
    </div>
  )
}
