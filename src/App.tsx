import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Workout from './components/Workout'
import Nutrition from './components/Nutrition'

export default function App(){
  const [data,setData]=useState<any>({})
  const [view,setView]=useState('dashboard')
  const [date,setDate]=useState('')

  useEffect(()=>{
    setDate(new Date().toISOString().slice(0,10))
  },[])

  return (
    <div style={{background:'#0f0f0f',color:'white',minHeight:'100vh',padding:20}}>
      <h1>Gym-E</h1>

      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setView('dashboard')}>Dashboard</button>
        <button onClick={()=>setView('workout')}>Workout</button>
        <button onClick={()=>setView('nutrition')}>Nutrition</button>
      </div>

      {view==='dashboard' && <Dashboard data={data} setData={setData} date={date}/>}
      {view==='workout' && <Workout data={data} setData={setData} date={date}/>}
      {view==='nutrition' && <Nutrition data={data} setData={setData} date={date}/>}
    </div>
  )
}
