export default function Workout({data,setData,date}:any){
  return (
    <div>
      <h2>Workout</h2>

      <button onClick={()=>{
        const workout={id:crypto.randomUUID(),name:'Push Day'}
        setData((p:any)=>({
          ...p,
          workouts:{
            ...p.workouts,
            [date]:[...(p.workouts?.[date]||[]),workout]
          }
        }))
      }}>
        Add Workout
      </button>

      {(data.workouts?.[date]||[]).map((w:any)=>(
        <div key={w.id}>
          {w.name}
          <button onClick={()=>{
            setData((p:any)=>({
              ...p,
              workouts:{
                ...p.workouts,
                [date]:p.workouts[date].filter((x:any)=>x.id!==w.id)
              }
            }))
          }}>Delete</button>
        </div>
      ))}
    </div>
  )
}
