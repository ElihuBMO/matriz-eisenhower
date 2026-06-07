// src/App.jsx
import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase"; // Importamos la conexión que creamos
import "./App.css";

const getTagClass = (tag) => {
  if (!tag) return "tag-custom";
  const normalized = tag.toLowerCase();
  const knownTags = {
    trabajo: "tag-trabajo",
    personal: "tag-personal",
    estudio: "tag-estudio",
    casa: "tag-casa",
  };
  return knownTags[normalized] || "tag-custom";
};

function App() {
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState("2026-06-07"); // Fecha de hoy

  const [categories, setCategories] = useState([]);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskTag, setNewTaskTag] = useState("");

  // 1. LEER DATOS DE LA NUBE EN TIEMPO REAL
  useEffect(() => {
    // Escuchar las categorías
    const unsubscribeCats = onSnapshot(
      doc(db, "config", "categorias"),
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().list) {
          setCategories(docSnap.data().list);
          if (!newTaskTag && docSnap.data().list.length > 0) {
            setNewTaskTag(docSnap.data().list[0]);
          }
        } else {
          // Si no existen en la nube, creamos las básicas
          const defaultCats = ["Trabajo", "Personal", "Estudio", "Casa"];
          setDoc(doc(db, "config", "categorias"), { list: defaultCats });
        }
      },
    );

    // Escuchar todas las tareas
    const unsubscribeTasks = onSnapshot(collection(db, "tasks"), (snapshot) => {
      const tasksData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTasks(tasksData);
    });

    // Limpieza al cerrar la app
    return () => {
      unsubscribeCats();
      unsubscribeTasks();
    };
  }, []);

  // 2. AÑADIR NUEVA CATEGORÍA A LA NUBE
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim() || categories.includes(newCategoryName.trim()))
      return;

    const updatedCategories = [...categories, newCategoryName.trim()];
    await setDoc(doc(db, "config", "categorias"), { list: updatedCategories });
    setNewCategoryName("");
  };

  // 3. ELIMINAR CATEGORÍA DE LA NUBE
  const handleDeleteCategory = async (catToDelete) => {
    const updatedCategories = categories.filter((cat) => cat !== catToDelete);
    await setDoc(doc(db, "config", "categorias"), { list: updatedCategories });
    if (newTaskTag === catToDelete && updatedCategories.length > 0) {
      setNewTaskTag(updatedCategories[0]);
    }
  };

  // 4. AÑADIR TAREA A LA NUBE
  const addTask = async (e) => {
    e.preventDefault();
    if (!newTaskText.trim() || categories.length === 0) return;

    const newTask = {
      title: newTaskText,
      date: selectedDate,
      quadrant: null,
      order: tasks.filter((t) => t.date === selectedDate && t.quadrant === null)
        .length,
      status: "pending",
      tag: newTaskTag || categories[0],
    };

    await addDoc(collection(db, "tasks"), newTask);
    setNewTaskText("");
  };

  // 5. ACTUALIZAR ESTADO (Completado/Pendiente) EN LA NUBE
  const toggleTaskStatus = async (taskId, currentStatus) => {
    const newStatus = currentStatus === "pending" ? "completed" : "pending";
    await updateDoc(doc(db, "tasks", taskId), { status: newStatus });
  };

  // 7. ELIMINAR TAREA DE LA NUBE
  const deleteTask = async (taskId) => {
    const confirmar = window.confirm(
      "¿Estás seguro de que deseas eliminar esta tarea de forma permanente?",
    );
    if (confirmar) {
      await deleteDoc(doc(db, "tasks", taskId));
    }
  };

  // 6. ARRASTRAR Y SOLTAR: ACTUALIZACIÓN MÚLTIPLE EN LA NUBE
  const manejarArrastre = async (resultado) => {
    const { destination, source } = resultado;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;

    const sourceId = source.droppableId === "inbox" ? null : source.droppableId;
    const destId =
      destination.droppableId === "inbox" ? null : destination.droppableId;
    const copiaTareas = [...tasks];

    const tareasOrigen = copiaTareas
      .filter((t) => t.date === selectedDate && t.quadrant === sourceId)
      .sort((a, b) => a.order - b.order);
    const tareasDestino =
      sourceId === destId
        ? tareasOrigen
        : copiaTareas
            .filter((t) => t.date === selectedDate && t.quadrant === destId)
            .sort((a, b) => a.order - b.order);

    const [itemMovido] = tareasOrigen.splice(source.index, 1);
    itemMovido.quadrant = destId;
    tareasDestino.splice(destination.index, 0, itemMovido);

    // Usamos un Batch para actualizar varios documentos de Firebase al mismo tiempo
    const batch = writeBatch(db);

    tareasOrigen.forEach((tarea, index) => {
      batch.update(doc(db, "tasks", tarea.id), {
        order: index,
        quadrant: sourceId,
      });
    });

    if (sourceId !== destId) {
      tareasDestino.forEach((tarea, index) => {
        batch.update(doc(db, "tasks", tarea.id), {
          order: index,
          quadrant: destId,
        });
      });
    }

    await batch.commit();
  };

  const tasksForToday = tasks.filter((task) => task.date === selectedDate);

  const renderListaTareas = (idContenedor, tareasFiltradas) => {
    const tareasOrdenadas = tareasFiltradas.sort((a, b) => a.order - b.order);

    return (
      <Droppable droppableId={idContenedor}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ flexGrow: 1, minHeight: "80px" }}
          >
            {tareasOrdenadas.map((task, index) => {
              let colorClass = task.quadrant
                ? `in-${task.quadrant.toLowerCase()}`
                : "";
              const statusClass =
                task.status === "completed" ? "completed" : "";
              const tagClass = getTagClass(task.tag);

              return (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`task-card ${colorClass} ${statusClass}`}
                    >
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={task.status === "completed"}
                        onChange={() => toggleTaskStatus(task.id, task.status)}
                      />
                      <div className="task-content">
                        <span className="task-text">{task.title}</span>
                        <span className={`task-tag ${tagClass}`}>
                          {task.tag}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="delete-task-btn"
                        title="Eliminar tarea"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  };

  return (
    <DragDropContext onDragEnd={manejarArrastre}>
      <div className="app-container">
        <header className="header">
          <h2>Matriz de Eisenhower</h2>
          <div className="day-selector">
            <button
              onClick={() => setSelectedDate("2026-06-07")}
              style={{
                backgroundColor: selectedDate === "2026-06-07" ? "#3b82f6" : "",
              }}
            >
              Hoy
            </button>
            <button
              onClick={() => setSelectedDate("2026-06-08")}
              style={{
                backgroundColor: selectedDate === "2026-06-08" ? "#3b82f6" : "",
              }}
            >
              Mañana
            </button>
          </div>
        </header>

        <main className="main-content">
          <aside className="inbox">
            <h3 style={{ marginTop: 0, color: "#374151" }}>
              📥 Bandeja de Entrada
            </h3>

            <form onSubmit={addTask} className="new-task-form">
              <input
                type="text"
                placeholder="Ej. Llamar al contador..."
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="new-task-input"
              />

              <select
                value={newTaskTag}
                onChange={(e) => setNewTaskTag(e.target.value)}
                className="new-task-select"
                disabled={categories.length === 0}
              >
                {categories.length === 0 ? (
                  <option value="">Cargando...</option>
                ) : (
                  categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))
                )}
              </select>

              <button
                type="submit"
                className="new-task-btn"
                disabled={categories.length === 0}
              >
                Añadir Tarea
              </button>

              <button
                type="button"
                className="toggle-categories-btn"
                onClick={() => setIsManagingCategories(!isManagingCategories)}
              >
                {isManagingCategories
                  ? "Cerrar editor"
                  : "⚙️ Editar categorías"}
              </button>
            </form>

            {isManagingCategories && (
              <div className="category-manager">
                <div className="category-list">
                  {categories.map((cat) => (
                    <div key={cat} className="category-badge">
                      <span>{cat}</span>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="delete-cat-btn"
                        title="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddCategory} className="add-category-row">
                  <input
                    type="text"
                    placeholder="Nueva etiqueta..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button type="submit">+</button>
                </form>
              </div>
            )}

            {renderListaTareas(
              "inbox",
              tasksForToday.filter((t) => t.quadrant === null),
            )}
          </aside>

          <section className="matrix-grid">
            <div className="quadrant">
              <h3>
                🔥 Hacer <br />
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "normal",
                    color: "#6b7280",
                  }}
                >
                  (Urgente e Importante)
                </span>
              </h3>
              {renderListaTareas(
                "Q1",
                tasksForToday.filter((t) => t.quadrant === "Q1"),
              )}
            </div>

            <div className="quadrant">
              <h3>
                🌱 Planificar <br />
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "normal",
                    color: "#6b7280",
                  }}
                >
                  (Importante, pero No Urgente)
                </span>
              </h3>
              {renderListaTareas(
                "Q2",
                tasksForToday.filter((t) => t.quadrant === "Q2"),
              )}
            </div>

            <div className="quadrant">
              <h3>
                🤝 Delegar <br />
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "normal",
                    color: "#6b7280",
                  }}
                >
                  (Urgente, pero No Importante)
                </span>
              </h3>
              {renderListaTareas(
                "Q3",
                tasksForToday.filter((t) => t.quadrant === "Q3"),
              )}
            </div>

            <div className="quadrant">
              <h3>
                🗑️ Eliminar <br />
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "normal",
                    color: "#6b7280",
                  }}
                >
                  (Ni Urgente, Ni Importante)
                </span>
              </h3>
              {renderListaTareas(
                "Q4",
                tasksForToday.filter((t) => t.quadrant === "Q4"),
              )}
            </div>
          </section>
        </main>
      </div>
    </DragDropContext>
  );
}

export default App;
