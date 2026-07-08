package app.spacebrowser.ui

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import app.spacebrowser.R
import app.spacebrowser.model.Space

/**
 * SpaceSwitcherSheet — Bottom sheet for switching between Spaces.
 *
 * Shows a list of all spaces with color indicators, names, and tab counts.
 * Allows switching, creating new, and deleting spaces.
 */
class SpaceSwitcherSheet(
    private val spaces: List<Space>,
    private val activeSpaceId: String?,
    private val tabCounts: Map<String, Int>,
    private val onSpaceSelected: (Space) -> Unit,
    private val onCreateSpace: () -> Unit,
    private val onDeleteSpace: (Space) -> Unit
) : BottomSheetDialogFragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.bottom_sheet_spaces, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val recyclerView = view.findViewById<RecyclerView>(R.id.spaces_recycler)
        val btnCreate = view.findViewById<View>(R.id.btn_create_space)
        val title = view.findViewById<TextView>(R.id.sheet_title)

        title.text = "🚀 Spaces (${spaces.size})"

        recyclerView.layoutManager = LinearLayoutManager(requireContext())
        recyclerView.adapter = SpaceAdapter(
            spaces = spaces,
            activeSpaceId = activeSpaceId,
            tabCounts = tabCounts,
            onSpaceClick = { space ->
                onSpaceSelected(space)
                dismiss()
            },
            onDeleteClick = { space ->
                onDeleteSpace(space)
                dismiss()
            }
        )

        btnCreate.setOnClickListener {
            dismiss()
            onCreateSpace()
        }
    }

    /**
     * RecyclerView adapter for space cards.
     */
    private class SpaceAdapter(
        private val spaces: List<Space>,
        private val activeSpaceId: String?,
        private val tabCounts: Map<String, Int>,
        private val onSpaceClick: (Space) -> Unit,
        private val onDeleteClick: (Space) -> Unit
    ) : RecyclerView.Adapter<SpaceAdapter.ViewHolder>() {

        class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val colorDot: ImageView = view.findViewById(R.id.space_color_dot)
            val name: TextView = view.findViewById(R.id.space_name)
            val meta: TextView = view.findViewById(R.id.space_meta)
            val deleteBtn: View = view.findViewById(R.id.btn_delete_space)
            val activeIndicator: View = view.findViewById(R.id.active_indicator)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_space, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val space = spaces[position]
            val isActive = space.id == activeSpaceId
            val tabs = tabCounts[space.id] ?: 0

            holder.name.text = space.name
            holder.meta.text = "$tabs tab${if (tabs != 1) "s" else ""} · 🔑 ${space.id.take(8)}"

            try {
                holder.colorDot.setColorFilter(Color.parseColor(space.color.hex))
            } catch (e: Exception) {
                holder.colorDot.setColorFilter(Color.parseColor("#37ADFF"))
            }

            holder.activeIndicator.visibility = if (isActive) View.VISIBLE else View.GONE

            holder.itemView.setOnClickListener { onSpaceClick(space) }
            holder.deleteBtn.setOnClickListener { onDeleteClick(space) }

            // Highlight active space
            holder.itemView.alpha = if (isActive) 1.0f else 0.8f
        }

        override fun getItemCount() = spaces.size
    }
}
