import { useContext } from 'react'
import { ThemeContext } from '../data/theme-context'

export const useTheme = () => useContext(ThemeContext)
