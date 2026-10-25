package org.citizen.schemeapp.model;

import jakarta.persistence.*;

@Entity
@Table(name = "app_counter")
public class AppCounter {

    @Id
    private String counterKey;

    private long lastValue = 0;

    public String getCounterKey() { return counterKey; }
    public void setCounterKey(String counterKey) { this.counterKey = counterKey; }
    public long getLastValue() { return lastValue; }
    public void setLastValue(long lastValue) { this.lastValue = lastValue; }
}
