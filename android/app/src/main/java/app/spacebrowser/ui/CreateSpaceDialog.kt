package app.spacebrowser.ui

import android.app.Dialog
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.DialogFragment
import app.spacebrowser.R
import app.spacebrowser.model.SpaceColor
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/**
 * CreateSpaceDialog — Material dialog for creating a new Space.
 *
 * Features:
 * - Name input
 * - Color picker using Material chips
 * - Create/cancel buttons
 */
class CreateSpaceDialog(
    private val onCreateSpace: (name: String, color: SpaceColor) -> Unit
) : DialogFragment() {

    private var selectedColor: SpaceColor = SpaceColor.BLUE

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val view = LayoutInflater.from(requireContext())
            .inflate(R.layout.dialog_create_space, null)

        val nameInput = view.findViewById<EditText>(R.id.input_space_name)
        val colorGroup = view.findViewById<ChipGroup>(R.id.color_chip_group)

        // Build color chips dynamically
        SpaceColor.entries.forEach { color ->
            val chip = Chip(requireContext()).apply {
                text = color.displayName
                isCheckable = true
                isChecked = color == selectedColor
                chipBackgroundColor = android.content.res.ColorStateList.valueOf(
                    Color.parseColor(color.hex)
                )
                setTextColor(Color.WHITE)
                tag = color
                setOnClickListener {
                    selectedColor = color
                }
            }
            colorGroup.addView(chip)
        }

        return MaterialAlertDialogBuilder(requireContext())
            .setTitle("🚀 New Space")
            .setView(view)
            .setPositiveButton("Create") { _, _ ->
                val name = nameInput.text.toString().trim()
                if (name.isEmpty()) {
                    Toast.makeText(requireContext(), "Name cannot be empty", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                onCreateSpace(name, selectedColor)
            }
            .setNegativeButton("Cancel", null)
            .create()
    }
}
