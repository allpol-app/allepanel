'use client' //po stronie klienta kod sie wykonuje

//importuje kontekst tworzenie i uzwyanie idk
import { createContext, useContext } from 'react' 

//exportuje typ user z parametrami id musi byc liczna, mail ciag znakow itp
export type User = { id: number; email: string; firstName?: string }

/*usercontext to tworzenie kontekstu ktory moze azwierac to co w <> czyli 
albo type User albo nic, i poczatkowo jest to co w () - nic
*/
export const UserContext = createContext<User | null>(null)

/*
opakowanie dlka porpzedniej funkcji zeby krocejk pisac useUser()
*/
export const useUser = () => useContext(UserContext)
