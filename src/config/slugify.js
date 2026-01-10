export const createSlug = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Reemplaza espacios con guiones
        .replace(/[^\w\-]+/g, '')    // Elimina caracteres no alfanuméricos (tildes, emojis)
        .replace(/\-\-+/g, '-');     // Reemplaza múltiples guiones con uno solo
};