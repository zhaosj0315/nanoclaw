import matplotlib.pyplot as plt

# Data from log analysis
labels = ['INFO', 'WARN', 'ERROR']
sizes = [2066, 301, 181]
colors = ['#4CAF50', '#FFC107', '#F44336']
explode = (0.1, 0, 0)  # explode 1st slice (INFO)

plt.figure(figsize=(10, 7))
plt.pie(sizes, explode=explode, labels=labels, colors=colors,
        autopct='%1.1f%%', shadow=True, startangle=140)

plt.axis('equal')  # Equal aspect ratio ensures that pie is drawn as a circle.
plt.title('Nanoclaw System Log Distribution (Total Events)')
plt.savefig('logs_distribution_pie.png')
print('Chart saved as logs_distribution_pie.png')
